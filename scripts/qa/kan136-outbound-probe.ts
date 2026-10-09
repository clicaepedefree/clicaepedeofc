import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import postgres from 'postgres'
import { setTimeout as sleep } from 'node:timers/promises'
import { enqueueWhatsappTransactionalMessage } from '../../src/features/whatsapp-bot/db'

const root =
  process.env.QA_ARTIFACT_ROOT || 'D:/ProjetoIA/codex/clicaepede/KAN-136'
const sql = postgres(process.env.POSTGRES_URL!, { prepare: false, max: 1 })
const reconcile = process.argv.includes('--reconcile')
let eventId = ''
const report: Record<string, unknown> = {
  kind: 'real-outbound-application-queue',
  realInbound: false,
  recipientReceipt: 'NOT_VERIFIED',
  status: 'NOT_RUN',
}
async function main() {
  try {
    assert(
      process.argv.slice(2).length === (reconcile ? 1 : 0) &&
        process.argv.slice(2).every(x => x === '--reconcile'),
      'Unknown arguments refused before enqueue'
    )
    eventId = reconcile
      ? JSON.parse(await readFile(root + '/outbound-evidence.json', 'utf8'))
          .eventId
      : 'kan136-fixed-' + randomUUID()
    assert(
      /^kan136-fixed-[0-9a-f-]{36}$/.test(eventId),
      'Invalid own event selector'
    )
    report.eventId = eventId
    assert.equal(process.env.WHATSAPP_BOT_ROLLOUT_MODE, 'pilot')
    assert.equal(process.env.WHATSAPP_BOT_PILOT_STORE_IDS, '9')
    const sessions =
      await sql`select s.id,s.number_id,s.status,n.phone_number from whatsapp_bot_sessions s join whatsapp_bot_numbers n on n.id=s.number_id and n.store_id=s.store_id where s.store_id=9`
    assert.equal(sessions.length, 1)
    const session = sessions[0]
    assert.equal(session.status, 'connected')
    const input = {
      storeId: 9,
      eventType: 'manual' as const,
      eventId,
      recipientPhone: session.phone_number,
      text: 'Clica e Pede: teste KAN-136. Mensagem fixa sem IA, pela fila do aplicativo.',
      numberId: session.number_id,
      sessionId: session.id,
      payload: { notificationCategory: 'transactional', qaRun: eventId },
      maxAttempts: 1,
    }
    if (!reconcile) {
      const first = await enqueueWhatsappTransactionalMessage(input)
      const duplicate = await enqueueWhatsappTransactionalMessage(input)
      assert(first.accepted)
      assert.equal(duplicate.accepted, false)
      assert(duplicate.duplicate)
      report.enqueue = { accepted: true, duplicateAccepted: false }
    } else report.enqueue = { scope: 'reconciliation only, no new send' }
    const deadline = Date.now() + 150000
    let event
    do {
      event = (
        await sql`select id,status,attempts,sent_at from whatsapp_bot_transactional_events where store_id=9 and payload->>'qaRun'=${eventId}`
      )[0]
      if (event && ['sent', 'failed', 'discarded'].includes(event.status)) break
      await sleep(1500)
    } while (Date.now() < deadline)
    assert(event, 'Own QA event missing')
    report.event = {
      id: event.id,
      status: event.status,
      attempts: event.attempts,
      sentAt: event.sent_at,
    }
    const attempts =
      await sql`select attempt_number,status,provider_message_id from whatsapp_bot_delivery_attempts where store_id=9 and event_id=${event.id}`
    report.delivery = attempts.map(x => ({
      attempt: x.attempt_number,
      status: x.status,
      providerAckPresent: !!x.provider_message_id,
    }))
    assert.equal(
      event.status,
      'sent',
      'Existing production scheduler did not send QA event'
    )
    assert.equal(attempts.filter(x => x.status === 'succeeded').length, 1)
    report.status = 'PASS_PROVIDER_ACK_ONLY'
    // Preserve the audit event; redact only its temporary recipient and body.
  } catch (error) {
    report.status = 'FAIL'
    report.error =
      error instanceof assert.AssertionError
        ? error.message
        : 'probe_failed_details_withheld'
    process.exitCode = 1
  } finally {
    try {
      assert(
        /^kan136-fixed-[0-9a-f-]{36}$/.test(eventId),
        'No validated fixture selector; cleanup refused'
      )
      // Cancel only the owned unclaimed/retryable event. Never mutate in-flight processing.
      await sql`update whatsapp_bot_transactional_events set status='discarded',last_error='KAN136 owned probe cleanup' where store_id=9 and payload->>'qaRun'=${eventId} and status in ('queued','failed')`
      const cleaned =
        await sql`update whatsapp_bot_transactional_events set recipient_phone='+5500000000000',payload=jsonb_set(payload,'{text}','"[KAN136 QA CONTENT REDACTED]"'::jsonb)||'{"qaRecipientRedacted":true}'::jsonb where store_id=9 and payload->>'qaRun'=${eventId} and status in ('sent','discarded') returning id`
      const remaining =
        await sql`select status,recipient_phone,payload->>'qaRecipientRedacted' redacted from whatsapp_bot_transactional_events where store_id=9 and payload->>'qaRun'=${eventId}`
      assert(
        remaining.every(
          x => x.recipient_phone === '+5500000000000' && x.redacted === 'true'
        ),
        'In-flight QA event preserved; later reconciliation required'
      )
      report.cleanup = {
        status: 'PASS',
        redactedRows: cleaned.length,
        pendingRows: 0,
        scope: 'own event only; audit retained and paired number preserved',
      }
    } catch {
      report.cleanup = {
        status: 'BLOCKED',
        reason: 'processing_or_cleanup_failure; never redacted in-flight event',
      }
      process.exitCode = 1
    }
    await sql.end().catch(() => {
      process.exitCode = 1
      report.businessStatus = report.status
      report.status = 'BLOCKED'
      report.databaseClose = 'FAIL'
    })
    await mkdir(root, { recursive: true })
    await writeFile(
      root + '/outbound-evidence.json',
      JSON.stringify(report, null, 2)
    )
    console.log(
      JSON.stringify({
        status: report.status,
        recipientReceipt: report.recipientReceipt,
        evidence: root + '/outbound-evidence.json',
      })
    )
  }
}
void main()
  .then(() => process.exit(process.exitCode || 0))
  .catch(() => {
    console.error('Probe report incomplete; no acceptance')
    process.exit(1)
  })
