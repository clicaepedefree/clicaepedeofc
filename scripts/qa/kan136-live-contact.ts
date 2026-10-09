import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'
import postgres from 'postgres'
import { enqueueWhatsappTransactionalMessage } from '../../src/features/whatsapp-bot/db'

// Explicitly authorized second contact only. No synthetic webhook is submitted by this probe.
const root =
  process.env.QA_ARTIFACT_ROOT || 'D:/ProjetoIA/codex/clicaepede/KAN-136'
const sql = postgres(process.env.POSTGRES_URL!, {
  prepare: false,
  max: 1,
  connect_timeout: 15,
})
const marker = 'kan136-contact-' + randomUUID()
const report: Record<string, unknown> = {
  marker,
  status: 'BLOCKED',
  realInbound: false,
  recipientReceipt: 'NOT_VERIFIED',
}
let baseline: { status: string; test_mode_enabled: boolean } | undefined
let configChanged = false
let target = ''
let start = new Date()
let preexistingContact = false
let invitationCreated = false
async function main() {
  try {
    assert.equal(
      process.argv.length,
      2,
      'No arguments accepted; use explicit private environment'
    )
    target = process.env.QA_TARGET_PHONE || ''
    assert(
      /^\+55\d{10,11}$/.test(target),
      'Explicit authorized second recipient required'
    )
    assert.equal(process.env.WHATSAPP_BOT_ROLLOUT_MODE, 'pilot')
    assert.equal(process.env.WHATSAPP_BOT_PILOT_STORE_IDS, '9')
    assert.equal(
      process.env.QA_ALLOW_STORE_WIDE_ACTIVATION,
      'true',
      'Explicit authorization for whole QA store activation required; not recipient-scoped'
    )
    report.activationScope =
      'Whole QA store9, explicitly authorized; not restricted to this recipient'
    const session = (
      await sql`select s.id,s.number_id,s.status,n.phone_number from whatsapp_bot_sessions s join whatsapp_bot_numbers n on n.id=s.number_id and n.store_id=s.store_id where s.store_id=9`
    )[0]
    assert(session && session.status === 'connected')
    assert.notEqual(
      session.phone_number,
      target,
      'Second contact must differ from paired phone'
    )
    const contacts =
      await sql`select id from whatsapp_bot_contacts where store_id=9 and phone_number=${target}`
    assert(contacts.length <= 1, 'Ambiguous authorized QA identity')
    preexistingContact = contacts.length === 1
    if (preexistingContact) {
      const conversations =
        await sql`select mode,status from whatsapp_bot_conversations where store_id=9 and contact_id=${contacts[0].id}`
      report.preexistingConversationStates = conversations
      assert(
        conversations.every(x => x.mode === 'automatic' && x.status === 'open'),
        'Existing conversation paused/closed; preserve baseline rather than force reset'
      )
    }
    baseline = (
      await sql<
        { status: string; test_mode_enabled: boolean }[]
      >`select status,test_mode_enabled from whatsapp_bot_assistant_configs where store_id=9`
    )[0]
    assert(
      baseline &&
        baseline.status === 'draft' &&
        baseline.test_mode_enabled === true,
      'Expected QA baseline draft/test mode'
    )
    await mkdir(root, { recursive: true })
    await writeFile(
      root + '/contact-instruction-private.json',
      JSON.stringify({ reply: 'atendente ' + marker, target })
    )
    await writeFile(
      root + '/contact-recovery-private.json',
      JSON.stringify({
        marker,
        baseline,
        target,
        startedAt: start.toISOString(),
      })
    )
    const changed =
      await sql`update whatsapp_bot_assistant_configs set status='active',test_mode_enabled=false where store_id=9 and status='draft' and test_mode_enabled=true returning store_id`
    assert.equal(changed.length, 1)
    configChanged = true
    const event = await enqueueWhatsappTransactionalMessage({
      storeId: 9,
      eventType: 'manual',
      eventId: marker,
      recipientPhone: target,
      numberId: session.number_id,
      sessionId: session.id,
      maxAttempts: 1,
      text: `Teste autorizado do Clica e Pede (KAN-136), sem IA. Por favor responda nesta conversa apenas: atendente ${marker}. Vamos conferir entrada real e transferencia para atendimento humano. Mensagem de QA, nao e atendimento comercial.`,
      payload: { qaRun: marker, notificationCategory: 'transactional' },
    })
    assert(event.accepted)
    invitationCreated = true
    console.log(
      'Authorized second-contact QA message queued; awaiting real reply (maximum 5 minutes)'
    )
    const deadline = Date.now() + 300000
    while (Date.now() < deadline) {
      const outbound = (
        await sql`select id,status,attempts from whatsapp_bot_transactional_events where store_id=9 and payload->>'qaRun'=${marker}`
      )[0]
      report.invitation = outbound
        ? {
            id: outbound.id,
            status: outbound.status,
            attempts: outbound.attempts,
          }
        : null
      const inbound = (
        await sql`select m.id,m.provider_message_id,m.conversation_id,m.contact_id,m.status from whatsapp_bot_messages m join whatsapp_bot_contacts c on c.id=m.contact_id and c.store_id=m.store_id where m.store_id=9 and m.direction='inbound' and m.created_at>=${start} and c.phone_number=${target} and m.body=${'atendente ' + marker} order by m.created_at limit 1`
      )[0]
      if (inbound) {
        assert(inbound.provider_message_id, 'Inbound provider ID required')
        if (preexistingContact)
          assert.equal(
            inbound.contact_id,
            contacts[0].id,
            'Authorized contact identity changed'
          )
        report.realInbound = true
        report.inbound = {
          id: inbound.id,
          status: inbound.status,
          conversationId: inbound.conversation_id,
          contactId: inbound.contact_id,
          providerIdPresent: !!inbound.provider_message_id,
        }
        const replies =
          await sql`select id,status,metadata->>'fallbackReason' reason from whatsapp_bot_messages where store_id=9 and direction='outbound' and provider_message_id=${'assistant:' + inbound.id}`
        const conversation = (
          await sql`select mode,status from whatsapp_bot_conversations where store_id=9 and id=${inbound.conversation_id}`
        )[0]
        report.automaticReplies = replies.map(x => ({
          id: x.id,
          status: x.status,
          reason: x.reason,
        }))
        report.conversation = conversation
        if (
          replies.length === 1 &&
          replies[0].status === 'sent' &&
          conversation?.mode === 'human' &&
          conversation.status === 'pending_human'
        ) {
          report.status = 'PASS_REAL_INBOUND_AND_DETERMINISTIC_REPLY_ACK'
          break
        }
      }
      await writeFile(
        root + '/contact-evidence.json',
        JSON.stringify(report, null, 2)
      )
      await sleep(2000)
    }
    if (report.status === 'BLOCKED')
      report.reason =
        'Real reply absent or deterministic reply not acknowledged within window; not equivalent to mock'
  } catch (error) {
    report.status = 'BLOCKED'
    report.reason =
      error instanceof assert.AssertionError
        ? error.message
        : 'Execution failed; private transport details withheld'
  } finally {
    try {
      if (configChanged && baseline) {
        const restored =
          await sql`update whatsapp_bot_assistant_configs set status=${baseline.status},test_mode_enabled=${baseline.test_mode_enabled} where store_id=9 and status='active' and test_mode_enabled=false returning store_id`
        assert.equal(
          restored.length,
          1,
          'QA config changed concurrently; recovery required'
        )
        report.configRestored = true
      }
    } catch {
      report.configRestored = false
      report.configRecovery =
        'BLOCKED: restore failed; private recovery file retained'
      process.exitCode = 1
    }
    try {
      await sql`update whatsapp_bot_transactional_events set status='discarded',last_error='KAN136 contact window ended' where store_id=9 and payload->>'qaRun'=${marker} and status in ('queued','failed')`
      const pending =
        await sql`select id from whatsapp_bot_transactional_events where store_id=9 and payload->>'qaRun'=${marker} and status='processing'`
      assert.equal(
        pending.length,
        0,
        'Contact invitation processing; preserve until reconciliation'
      )
      await sql`update whatsapp_bot_transactional_events set recipient_phone='+5500000000000',payload=jsonb_set(payload,'{text}','"[KAN136 QA CONTENT REDACTED]"'::jsonb)||'{"qaRecipientRedacted":true}'::jsonb where store_id=9 and payload->>'qaRun'=${marker} and status in ('sent','discarded')`
      const checked =
        await sql`select status,recipient_phone,payload->>'text' body,payload->>'qaRecipientRedacted' redacted from whatsapp_bot_transactional_events where store_id=9 and payload->>'qaRun'=${marker}`
      if (invitationCreated)
        assert.equal(
          checked.length,
          1,
          'Owned invitation missing during cleanup'
        )
      assert(
        checked.every(
          x =>
            ['sent', 'discarded'].includes(x.status) &&
            x.recipient_phone === '+5500000000000' &&
            x.redacted === 'true' &&
            x.body === '[KAN136 QA CONTENT REDACTED]'
        ),
        'Owned invitation cleanup readback failed'
      )
      report.cleanup = configChanged
        ? 'Existing contact/history preserved; invitation recipient redacted; consult configRestored separately'
        : 'No config/contact mutation performed'
    } catch {
      report.cleanup = 'BLOCKED; reconciliation needed'
      process.exitCode = 1
    }
    if (process.exitCode) {
      report.businessStatus = report.status
      report.status = 'BLOCKED'
    }
    await sql.end().catch(() => {
      process.exitCode = 1
      report.businessStatus = report.status
      report.status = 'BLOCKED'
      report.databaseClose = 'FAIL'
    })
    if (report.configRestored === true)
      await unlink(root + '/contact-recovery-private.json').catch(() => {})
    await mkdir(root, { recursive: true })
    await writeFile(
      root + '/contact-evidence.json',
      JSON.stringify(report, null, 2)
    )
    console.log(
      JSON.stringify({
        status: report.status,
        realInbound: report.realInbound,
        cleanup: report.cleanup,
      })
    )
    if (report.status === 'BLOCKED') process.exitCode = 1
  }
}
void main()
  .then(() => process.exit(process.exitCode || 0))
  .catch(() => {
    console.error('Contact probe incomplete; no acceptance')
    process.exitCode = 1
  })
