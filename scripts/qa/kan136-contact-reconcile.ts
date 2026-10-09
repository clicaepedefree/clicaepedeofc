import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import postgres from 'postgres'

// Read-only reconciliation: never resend or replay an inbound webhook.
const root =
  process.env.QA_ARTIFACT_ROOT || 'D:/ProjetoIA/codex/clicaepede/KAN-136'
const sql = postgres(process.env.POSTGRES_URL!, {
  prepare: false,
  max: 1,
  connect_timeout: 15,
})
const report: Record<string, unknown> = {
  status: 'BLOCKED',
  recipientReceipt: 'NOT_VERIFIED',
  syntheticWebhook: false,
}
async function main() {
  try {
    assert.equal(process.argv.length, 2)
    const original = JSON.parse(
      await readFile(root + '/contact-evidence.json', 'utf8')
    )
    const instruction = JSON.parse(
      await readFile(root + '/contact-instruction-private.json', 'utf8')
    )
    const marker = original.marker
    assert(/^kan136-contact-[0-9a-f-]{36}$/.test(marker))
    assert.equal(instruction.reply, 'atendente ' + marker)
    report.marker = marker
    const target = instruction.target
    assert(/^\+55\d{10,11}$/.test(target))
    const inbound =
      await sql`select m.id,m.provider_message_id,m.conversation_id,m.contact_id,m.status,m.metadata->>'provider' provider,m.metadata->>'source' source,length(m.body) body_length from whatsapp_bot_messages m join whatsapp_bot_contacts c on c.id=m.contact_id and c.store_id=m.store_id where m.store_id=9 and m.direction='inbound' and c.phone_number=${target} and position(${marker} in m.body)>0`
    assert.equal(
      inbound.length,
      1,
      'Expected one uniquely correlated real inbound'
    )
    const message = inbound[0]
    assert(message.provider_message_id)
    assert.equal(message.status, 'received')
    assert.equal(message.provider, 'evolution')
    assert.equal(message.source, 'whatsapp_inbound')
    const replies =
      await sql`select id,status,metadata->>'fallbackReason' reason,metadata->>'intent' intent,metadata->'delivery'->>'providerMessageId' is not null as provider_ack_present from whatsapp_bot_messages where store_id=9 and provider_message_id=${'assistant:' + message.id} and direction='outbound'`
    assert.equal(replies.length, 1)
    assert.equal(replies[0].status, 'sent')
    assert.equal(replies[0].reason, 'explicit_human_request')
    assert.equal(replies[0].provider_ack_present, true)
    const conversation = (
      await sql`select mode,status from whatsapp_bot_conversations where store_id=9 and id=${message.conversation_id} and contact_id=${message.contact_id}`
    )[0]
    assert.equal(conversation.mode, 'human')
    assert.equal(conversation.status, 'pending_human')
    const config = (
      await sql`select status,test_mode_enabled from whatsapp_bot_assistant_configs where store_id=9`
    )[0]
    assert(
      config.status === 'draft' && config.test_mode_enabled === true,
      'Original QA config not restored'
    )
    report.applicationFlowStatus = 'PASS_REAL_USER_INBOUND_DB_AND_REPLY_ACK'
    report.realInbound = true
    report.inbound = {
      id: message.id,
      status: message.status,
      contactId: message.contact_id,
      conversationId: message.conversation_id,
      authorizedFullContactMatched: true,
      uniqueMarkerMatched: true,
    }
    report.reply = replies[0]
    report.conversation = conversation
    report.configRestored = true
    report.observation =
      'Real user reply correlated by unique run marker, full authorized contact and assistant inbound reference. Exact-text selector missed extra characters. No synthetic callback, new send or webhook replay.'
    const session = (
      await sql`select status,provider_session_id from whatsapp_bot_sessions where store_id=9`
    )[0]
    assert.equal(session.status, 'connected')
    const base = new URL(process.env.WHATSAPP_EVOLUTION_API_BASE_URL!)
    assert.equal(base.protocol, 'https:')
    assert.equal(base.hostname, 'evolution-staging.clicaepede.com.br')
    const url = new URL(
      '/chat/findMessages/' + encodeURIComponent(session.provider_session_id),
      base
    )
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      headers: {
        apikey: process.env.WHATSAPP_EVOLUTION_API_KEY!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        where: { key: { remoteJid: target.slice(1) + '@s.whatsapp.net' } },
        page: 1,
        offset: 100,
      }),
      signal: AbortSignal.timeout(15000),
    })
    assert(response.ok, 'Provider history read failed')
    const data = await response.json()
    const records =
      data.messages?.records ??
      data.records ??
      (Array.isArray(data.messages) ? data.messages : null)
    assert(Array.isArray(records), 'Unrecognized provider history shape')
    report.providerHistoryShape = {
      records: records.length,
      firstKeys: Object.keys(records[0] || {}),
      keyType: typeof records[0]?.key,
    }
    const exact = records.filter(
      (x: any) => x.key?.id === message.provider_message_id
    )
    assert.equal(exact.length, 1, 'Provider inbound ID correlation failed')
    assert.equal(exact[0].key.fromMe, false, 'Expected real external sender')
    const jidPhone =
      '+' + String(exact[0].key.remoteJid).split('@')[0].replace(/\D/g, '')
    assert.equal(
      jidPhone,
      target,
      'Provider sender differs from authorized full phone'
    )
    report.status = 'PASS_REAL_INBOUND_AND_DETERMINISTIC_REPLY_ACK'
    report.realInbound = true
    report.providerProof = {
      exactIdMatched: true,
      fromMe: false,
      authorizedFullSenderMatched: true,
    }
    report.inbound = {
      id: message.id,
      status: message.status,
      contactId: message.contact_id,
      conversationId: message.conversation_id,
    }
    report.reply = replies[0]
    report.conversation = conversation
    report.configRestored = true
    report.observation =
      'Original exact-text selector missed extra characters; unique marker/full sender/provider ID correlated read-only. No new send or webhook replay.'
  } catch (error) {
    report.status = report.applicationFlowStatus
      ? 'PARTIAL_PROVIDER_HISTORY_UNVERIFIED'
      : 'BLOCKED'
    report.providerHistoryStatus = 'BLOCKED'
    report.reason =
      error instanceof assert.AssertionError
        ? error.message
        : 'Private reconciliation details withheld'
    process.exitCode = 1
  } finally {
    await sql.end().catch(() => {
      report.status = 'BLOCKED'
      process.exitCode = 1
    })
    await writeFile(
      root + '/contact-reconciled-evidence.json',
      JSON.stringify(report, null, 2)
    )
    console.log(
      JSON.stringify({
        status: report.status,
        realInbound: report.realInbound,
        configRestored: report.configRestored,
      })
    )
  }
}
void main().catch(() => {
  console.error('Reconciliation report incomplete; no acceptance')
  process.exitCode = 1
})
