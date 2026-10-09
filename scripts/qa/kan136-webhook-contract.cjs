const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')

// HTTP fixtures validate the deployed app, never receipt through WhatsApp.
async function runWebhookContract(
  sql,
  base,
  exerciseHandoff,
  onResult = () => {}
) {
  const secret = process.env.WHATSAPP_EVOLUTION_WEBHOOK_SECRET
  assert(secret, 'Webhook test credential required')
  const run = 'KAN136-' + randomUUID()
  const phone = '+5500000000000'
  const entries = []
  let contactId
  let conversationId
  const session = (
    await sql`select id,number_id,provider_session_id,status from whatsapp_bot_sessions where store_id=9`
  )[0]
  assert.equal(
    session?.status,
    'connected',
    'Existing paired QA session required'
  )
  assert.equal(
    (
      await sql`select id from whatsapp_bot_contacts where store_id=9 and phone_number=${phone}`
    ).length,
    0,
    'Synthetic fixture already exists; refusing overwrite'
  )
  const execute = async (id, work) => {
    const entry = {
      id,
      kind: 'deployed-http-synthetic-fixture',
      status: 'NOT_RUN',
    }
    try {
      entry.proof = await work()
      entry.status = 'PASS'
    } catch (error) {
      entry.status = 'FAIL'
      entry.error = error.message
        .replaceAll(phone, '[SYNTHETIC_PHONE]')
        .replaceAll(secret, '[REDACTED]')
    }
    entries.push(entry)
    onResult(entry)
  }
  const post = async (payload, authorized = true, raw = false) => {
    const response = await fetch(base + '/api/webhooks/whatsapp/evolution', {
      method: 'POST',
      redirect: 'error',
      headers: {
        'content-type': 'application/json',
        ...(authorized ? { 'x-clica-webhook-secret': secret } : {}),
      },
      body: raw ? payload : JSON.stringify(payload),
      signal: AbortSignal.timeout(25000),
    })
    return { status: response.status, body: await response.json() }
  }
  const payload = (id, body, extras = {}) => ({
    event: 'messages.upsert',
    instance: session.provider_session_id,
    data: {
      key: {
        id: run + id,
        remoteJid: phone.slice(1) + '@s.whatsapp.net',
        fromMe: false,
        ...extras,
      },
      pushName: 'QA KAN136 synthetic',
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: { conversation: body },
    },
  })
  try {
    contactId = (
      await sql`insert into whatsapp_bot_contacts(store_id,phone_number,display_name,source,metadata) values(9,${phone},'QA KAN136 synthetic','manual',${sql.json({ qaRun: run })}) returning id`
    )[0].id
    conversationId = (
      await sql`insert into whatsapp_bot_conversations(store_id,contact_id,number_id,session_id,mode,status,human_paused_at,context_summary,metadata) values(9,${contactId},${session.number_id},${session.id},'human','pending_human',now(),'QA KAN136 synthetic fixture',${sql.json({ qaRun: run, humanHandoff: { reason: 'explicit_human_request', confidence: 'high' } })}) returning id`
    )[0].id
    await execute('WEBHOOK-auth', async () => {
      const r = await post({}, false)
      assert.equal(r.status, 401)
      assert.equal(r.body.reason, 'invalid_signature')
      return { http: r.status }
    })
    await execute('WEBHOOK-malformed', async () => {
      const r = await post('{', true, true)
      assert.equal(r.status, 400)
      return { http: r.status }
    })
    await execute('WEBHOOK-unsupported', async () => {
      const r = await post({ event: 'not-supported' })
      assert.equal(r.status, 200)
      assert(r.body.ignored)
      return { ignored: true }
    })
    await execute('WEBHOOK-missing-instance', async () => {
      const r = await post({ event: 'messages.upsert' })
      assert.equal(r.status, 400)
      return { http: r.status }
    })
    for (const [id, extras] of [
      ['fromMe', { fromMe: true }],
      ['group', { remoteJid: '5500000000000@g.us' }],
    ]) {
      await execute('WEBHOOK-ignore-' + id, async () => {
        const r = await post(payload(id, 'fixture', extras))
        assert.equal(r.status, 200)
        assert(r.body.ignored)
        return { ignored: true }
      })
    }
    await execute('WEBHOOK-ingestion-paused', async () => {
      const r = await post(payload('-new', 'QA synthetic message'))
      assert.equal(r.status, 202)
      assert.equal(r.body.contact.storeId, 9)
      assert.equal(r.body.contact.id, contactId)
      assert.equal(r.body.conversation.id, conversationId)
      assert.equal(r.body.messageCreated, true)
      assert.equal(r.body.assistant.deliveryStatus, 'not_sent')
      const rows =
        await sql`select direction,status from whatsapp_bot_messages where store_id=9 and conversation_id=${conversationId} and provider_message_id=${run + '-new'}`
      assert.equal(rows.length, 1)
      assert.equal(rows[0].direction, 'inbound')
      return {
        persisted: true,
        tenant: 9,
        replyBlocked: true,
        gateReason: r.body.assistant.reason,
        scope:
          'no-send confirmed; draft/test mode may block before conversation pause',
        realWhatsAppInbound: false,
      }
    })
    await execute('WEBHOOK-duplicate', async () => {
      const r = await post(payload('-new', 'QA synthetic message'))
      assert.equal(r.status, 200)
      assert.equal(r.body.messageCreated, false)
      assert.equal(
        (
          await sql`select id from whatsapp_bot_messages where store_id=9 and conversation_id=${conversationId} and provider_message_id=${run + '-new'}`
        ).length,
        1
      )
      return { logicalMessages: 1, replayCreated: false }
    })
    await execute('WEBHOOK-optout-persistence', async () => {
      const r = await post(payload('-optout', 'parar'))
      assert.equal(r.status, 202)
      assert(
        (
          await sql`select promotional_opt_out_at from whatsapp_bot_contacts where store_id=9 and id=${contactId}`
        )[0].promotional_opt_out_at
      )
      assert.equal(
        (
          await sql`select id from whatsapp_bot_messages where store_id=9 and conversation_id=${conversationId} and direction='outbound'`
        ).length,
        0
      )
      return {
        optedOutPersisted: true,
        outgoingMessages: 0,
        scope: 'synthetic inbound to paused fixture, not promotional dispatch',
      }
    })
    await exerciseHandoff({ contactId, conversationId })
  } finally {
    if (contactId) {
      const owned =
        await sql`select id from whatsapp_bot_contacts where store_id=9 and id=${contactId} and metadata->>'qaRun'=${run}`
      // Ingestion merges metadata; cleanup is limited to the exact owned ID and sentinel.
      assert.equal(
        owned.length,
        1,
        'Owned fixture marker changed; refusing unscoped cleanup'
      )
      if (owned.length) {
        await sql.begin(async tx => {
          await tx`delete from whatsapp_bot_messages where store_id=9 and contact_id=${contactId}`
          await tx`delete from whatsapp_bot_conversations where store_id=9 and contact_id=${contactId}`
          await tx`delete from whatsapp_bot_contacts where store_id=9 and id=${contactId} and phone_number=${phone}`
        })
      }
      assert.equal(
        (
          await sql`select id from whatsapp_bot_contacts where store_id=9 and id=${contactId}`
        ).length,
        0,
        'Owned fixture cleanup failed'
      )
    }
    const pairedSessionPreserved =
      (
        await sql`select status from whatsapp_bot_sessions where store_id=9 and id=${session.id}`
      )[0]?.status === 'connected'
    assert(pairedSessionPreserved, 'Existing paired session changed')
    entries.push({
      id: 'WEBHOOK-cleanup',
      kind: 'owned-fixture-cleanup',
      status: 'PASS',
      proof: { removedOwnContact: !!contactId, pairedSessionPreserved },
    })
    onResult(entries[entries.length - 1])
  }
  return entries
}
module.exports = { runWebhookContract }
