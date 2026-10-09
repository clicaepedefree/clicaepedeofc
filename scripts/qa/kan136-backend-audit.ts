import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import postgres from 'postgres'

type Status = 'PASS' | 'FAIL' | 'BLOCKED'
type Check = { id: string; status: Status; evidence: Record<string, unknown> }
type Row = Record<string, any>
const STORE = 9
const OUTPUT = 'D:/ProjetoIA/codex/clicaepede/KAN-136/backend-evidence.json'
const salt = randomBytes(32)
const ref = (value: unknown) =>
  typeof value === 'string' && value
    ? createHmac('sha256', salt).update(value).digest('hex').slice(0, 24)
    : null
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const count = (value: unknown) => {
  const n = Number(value)
  return Number.isSafeInteger(n) && n >= 0 ? n : null
}
const date = (value: unknown) => {
  if (!(value instanceof Date) && typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}
const state = (value: unknown, allowed: string[]) =>
  typeof value === 'string' && allowed.includes(value) ? value : 'unrecognized'
function safeUrl(value: unknown) {
  try {
    const url = new URL(String(value))
    // Only the fixed callback path may be published; arbitrary paths can contain PII.
    return {
      host: url.hostname,
      path:
        url.pathname === '/api/webhooks/whatsapp/evolution'
          ? url.pathname
          : '[noncanonical-path]',
      https: url.protocol === 'https:',
      hasQuery: Boolean(url.search),
      hasFragment: Boolean(url.hash),
      hasCredentials: Boolean(url.username || url.password),
    }
  } catch {
    return null
  }
}
const required: Record<string, string[]> = {
  whatsapp_bot_numbers: ['id', 'store_id', 'status'],
  whatsapp_bot_sessions: [
    'id',
    'store_id',
    'number_id',
    'provider_session_id',
    'status',
    'last_heartbeat_at',
    'updated_at',
  ],
  whatsapp_bot_assistant_configs: [
    'id',
    'store_id',
    'status',
    'test_mode_enabled',
    'updated_at',
  ],
  whatsapp_bot_contacts: ['id', 'store_id', 'promotional_opt_out_at'],
  whatsapp_bot_conversations: [
    'id',
    'store_id',
    'contact_id',
    'mode',
    'status',
    'human_paused_at',
  ],
  whatsapp_bot_messages: [
    'id',
    'store_id',
    'session_id',
    'conversation_id',
    'direction',
    'status',
    'provider_message_id',
    'metadata',
    'occurred_at',
  ],
  whatsapp_bot_transactional_events: [
    'id',
    'store_id',
    'session_id',
    'event_type',
    'status',
    'idempotency_key',
    'attempts',
    'sent_at',
    'created_at',
  ],
  whatsapp_bot_delivery_attempts: [
    'store_id',
    'event_id',
    'attempt_number',
    'status',
    'provider_message_id',
  ],
}
const checks: Check[] = []
function add(id: string, status: Status, evidence: Record<string, unknown>) {
  checks.push({ id, status, evidence })
}
class ProviderFailure extends Error {
  constructor(readonly httpStatus: number | null) {
    super('provider_read_failed')
  }
}
async function providerRead(
  base: URL,
  key: string,
  route: string,
  body?: unknown
) {
  const url = new URL(base.href)
  url.pathname = `${base.pathname.replace(/\/$/, '')}${route}`
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    redirect: 'error',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new ProviderFailure(response.status)
  const text = await response.text()
  if (text.length > 2_000_000) throw new ProviderFailure(null)
  return JSON.parse(text)
}
function records(payload: any): Row[] | null {
  const candidate =
    payload?.messages?.records ??
    payload?.records ??
    (Array.isArray(payload?.messages) ? payload.messages : null)
  return Array.isArray(candidate) &&
    candidate.every(x => x && typeof x === 'object')
    ? candidate
    : null
}

async function audit() {
  let sessions: Row[] = []
  let historical: Row[] = []
  const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL
  const rollout = process.env.WHATSAPP_BOT_ROLLOUT_MODE
  const pilots = (process.env.WHATSAPP_BOT_PILOT_STORE_IDS ?? '')
    .split(',')
    .map(x => x.trim())
  add(
    'bootstrap_rollout_pilot9',
    rollout === undefined
      ? 'BLOCKED'
      : rollout === 'pilot' && pilots.length === 1 && pilots[0] === '9'
        ? 'PASS'
        : 'FAIL',
    {
      source: 'inherited_process_env_not_deployed_env',
      pilot9Only:
        rollout === 'pilot' && pilots.length === 1 && pilots[0] === '9',
    }
  )
  const dbChecks = [
    'db_snapshot',
    'db_session_connected',
    'db_assistant_reply_eligibility',
    'db_qa_state',
    'db_duplicate_ids',
    'historical_125',
    'historical_134',
    'historical_134_inbound',
  ]
  if (!connectionString) {
    add('db_catalog', 'BLOCKED', { reason: 'database_env_missing' })
    for (const id of dbChecks)
      add(id, 'BLOCKED', { reason: 'database_unavailable' })
  } else {
    const sql = postgres(connectionString, {
      prepare: false,
      max: 1,
      connect_timeout: 10,
      idle_timeout: 3,
      onnotice: () => {},
    })
    try {
      const snapshot = await sql.begin(
        'isolation level repeatable read read only',
        async tx => {
          await tx`set local statement_timeout = '15000ms'`
          const [guard] =
            await tx`select current_setting('transaction_read_only') as read_only`
          if (guard.read_only !== 'on') throw new Error('readonly_guard')
          const columns =
            await tx`select table_name, column_name, data_type from information_schema.columns
          where table_schema='public' and table_name in ${tx(Object.keys(required))}`
          const missing = Object.entries(required).flatMap(([table, names]) =>
            names
              .filter(
                name =>
                  !columns.some(
                    c => c.table_name === table && c.column_name === name
                  )
              )
              .map(name => `${table}.${name}`)
          )
          if (missing.length) return { missing }
          const indexes =
            await tx`select c.relname as table_name, i.indisunique as is_unique,
          i.indisvalid as is_valid from pg_index i join pg_class c on c.oid=i.indrelid
          join pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname in ${tx(Object.keys(required))}`
          const sessionRows =
            await tx`select id, number_id, provider_session_id, status, last_heartbeat_at, updated_at
          from public.whatsapp_bot_sessions where store_id=${STORE} order by updated_at desc`
          const numbers =
            await tx`select id, status from public.whatsapp_bot_numbers where store_id=${STORE}`
          const configs =
            await tx`select id, status, test_mode_enabled, updated_at
          from public.whatsapp_bot_assistant_configs where store_id=${STORE}`
          const contacts = await tx`select count(*)::int as total,
          count(*) filter(where promotional_opt_out_at is not null)::int as opted_out
          from public.whatsapp_bot_contacts where store_id=${STORE}`
          const conversations =
            await tx`select mode, status, count(*)::int as total,
          count(*) filter(where human_paused_at is not null)::int as paused
          from public.whatsapp_bot_conversations where store_id=${STORE} group by mode,status`
          const events =
            await tx`select event_type,status,count(*)::int as total
          from public.whatsapp_bot_transactional_events where store_id=${STORE} group by event_type,status`
          const attempts = await tx`select status,count(*)::int as total
          from public.whatsapp_bot_delivery_attempts where store_id=${STORE} group by status`
          const duplicates = await tx`select
          (select count(*)::int from (select provider_message_id from public.whatsapp_bot_messages
            where store_id=${STORE} and provider_message_id is not null group by provider_message_id having count(*)>1) d) as message_groups,
          (select count(*)::int from (select idempotency_key from public.whatsapp_bot_transactional_events
            where store_id=${STORE} group by idempotency_key having count(*)>1) d) as event_groups,
          (select count(*)::int from (select event_id,attempt_number from public.whatsapp_bot_delivery_attempts
            where store_id=${STORE} group by event_id,attempt_number having count(*)>1) d) as attempt_groups`
          const history: Row[] = []
          for (const label of ['125', '134']) {
            const selected = process.env[`KAN136_EVENT_${label}_ID`]
            if (selected && !uuid(selected)) {
              history.push({ label, invalid: true })
              continue
            }
            if (!selected && label === '134') {
              history.push({ label, missingSelector: true })
              continue
            }
            const found = selected
              ? await tx`select id,session_id,event_type,status,attempts,sent_at,created_at from public.whatsapp_bot_transactional_events
                where store_id=${STORE} and id=${selected}::uuid limit 2`
              : await tx`select id,session_id,event_type,status,attempts,sent_at,created_at from public.whatsapp_bot_transactional_events
                where store_id=${STORE} and id::text like 'f829412f%' limit 2`
            if (found.length !== 1) {
              history.push({ label, matches: found.length })
              continue
            }
            const delivery =
              await tx`select attempt_number,status,provider_message_id
            from public.whatsapp_bot_delivery_attempts where store_id=${STORE} and event_id=${found[0].id}
            order by attempt_number`
            history.push({ label, event: found[0], delivery })
          }
          const messageId = process.env.KAN136_MESSAGE_134_ID
          if (messageId && uuid(messageId)) {
            const found =
              await tx`select id,session_id,direction,status,provider_message_id,occurred_at
            from public.whatsapp_bot_messages where store_id=${STORE} and id=${messageId}::uuid`
            const replies =
              await tx`select id,session_id,status,metadata->'delivery'->>'providerMessageId' as provider_message_id
            from public.whatsapp_bot_messages where store_id=${STORE} and provider_message_id=${`assistant:${messageId}`}`
            history.push({
              label: '134_inbound',
              inbound: found[0] ?? null,
              replies,
            })
          } else
            history.push({
              label: '134_inbound',
              missingSelector: !messageId,
              invalid: Boolean(messageId),
            })
          return {
            missing,
            indexes,
            sessionRows,
            numbers,
            configs,
            contacts,
            conversations,
            events,
            attempts,
            duplicates,
            history,
          }
        }
      )
      add('db_catalog', snapshot.missing.length ? 'FAIL' : 'PASS', {
        missingColumns: snapshot.missing,
        source: 'live_catalog_compared_to_repository_schema',
      })
      if (!('sessionRows' in snapshot)) {
        for (const id of dbChecks)
          add(id, 'BLOCKED', { reason: 'schema_mismatch' })
      } else {
        sessions = snapshot.sessionRows!
        historical = snapshot.history!
        add('db_snapshot', 'PASS', {
          transactionReadOnly: true,
          isolation: 'repeatable_read',
          indexes: Object.keys(required).map(table => ({
            table,
            total: snapshot.indexes!.filter(i => i.table_name === table).length,
            validUnique: snapshot.indexes!.filter(
              i => i.table_name === table && i.is_unique && i.is_valid
            ).length,
          })),
        })
        const connected = sessions.filter(s => s.status === 'connected')
        add('db_session_connected', connected.length === 1 ? 'PASS' : 'FAIL', {
          connectedCount: connected.length,
          sessions: sessions.map(s => ({
            id: count(s.id),
            numberId: count(s.number_id),
            instanceRef: ref(s.provider_session_id),
            status: state(s.status, [
              'connected',
              'connecting',
              'pending_qr',
              'paused',
              'disconnected',
              'error',
            ]),
            heartbeatAt: date(s.last_heartbeat_at),
            updatedAt: date(s.updated_at),
          })),
          numbers: snapshot.numbers!.map(n => ({
            id: count(n.id),
            status: state(n.status, [
              'active',
              'inactive',
              'disconnected',
              'error',
            ]),
          })),
        })
        const configs = snapshot.configs!
        add(
          'db_assistant_reply_eligibility',
          configs.length === 1 &&
            configs[0].status === 'active' &&
            configs[0].test_mode_enabled === false
            ? 'PASS'
            : 'FAIL',
          {
            scope: 'configuration_only_not_transport',
            interpretation:
              'reply_precondition_not_met_is_setup_limitation_not_automatic_app_bug',
            configs: configs.map(c => ({
              id: count(c.id),
              status: state(c.status, ['draft', 'active', 'paused']),
              testModeEnabled: c.test_mode_enabled === true,
              updatedAt: date(c.updated_at),
            })),
          }
        )
        add('db_qa_state', 'PASS', {
          scope: 'store9_aggregates_not_new_test_cases',
          contacts: {
            total: count(snapshot.contacts![0].total),
            optedOut: count(snapshot.contacts![0].opted_out),
          },
          conversations: snapshot.conversations!.map(c => ({
            mode: state(c.mode, ['automatic', 'human']),
            status: state(c.status, [
              'open',
              'pending_human',
              'closed',
              'blocked',
            ]),
            total: count(c.total),
            paused: count(c.paused),
          })),
          events: snapshot.events!.map(e => ({
            type: state(e.event_type, [
              'order_status',
              'cashback',
              'loyalty',
              'manual',
              'fallback',
            ]),
            status: state(e.status, [
              'queued',
              'processing',
              'sent',
              'failed',
              'discarded',
            ]),
            total: count(e.total),
          })),
          attempts: snapshot.attempts!.map(a => ({
            status: state(a.status, [
              'attempted',
              'succeeded',
              'failed',
              'skipped',
            ]),
            total: count(a.total),
          })),
        })
        const d = snapshot.duplicates![0]
        add(
          'db_duplicate_ids',
          Number(d.message_groups) +
            Number(d.event_groups) +
            Number(d.attempt_groups) ===
            0
            ? 'PASS'
            : 'FAIL',
          {
            messageGroups: count(d.message_groups),
            eventGroups: count(d.event_groups),
            attemptGroups: count(d.attempt_groups),
            scope: 'existing_rows_not_replay_test',
          }
        )
        for (const h of historical) {
          if (h.event) {
            const succeeded = h.delivery.filter(
              (a: Row) => a.status === 'succeeded' && a.provider_message_id
            )
            add(
              `historical_${h.label}`,
              h.event.status === 'sent' && succeeded.length > 0
                ? 'PASS'
                : 'FAIL',
              {
                scope: 'historical_database_send_ack_only',
                eventId: uuid(h.event.id) ? h.event.id : null,
                status: state(h.event.status, [
                  'queued',
                  'processing',
                  'sent',
                  'failed',
                  'discarded',
                ]),
                sentAt: date(h.event.sent_at),
                attempts: count(h.event.attempts),
                delivery: h.delivery.map((a: Row) => ({
                  attempt: count(a.attempt_number),
                  status: state(a.status, [
                    'attempted',
                    'succeeded',
                    'failed',
                    'skipped',
                  ]),
                  providerRef: ref(a.provider_message_id),
                })),
              }
            )
          } else if (
            h.label === '134_inbound' &&
            !h.missingSelector &&
            !h.invalid
          ) {
            add(
              'historical_134_inbound',
              h.inbound?.direction === 'inbound' &&
                h.inbound?.provider_message_id
                ? 'PASS'
                : 'FAIL',
              {
                scope: 'historical_persistence_not_new_inbound_or_origin_proof',
                found: Boolean(h.inbound),
                providerRef: ref(h.inbound?.provider_message_id),
                replyCount: h.replies.length,
                replies: h.replies.map((r: Row) => ({
                  status: state(r.status, [
                    'queued',
                    'sent',
                    'delivered',
                    'read',
                    'failed',
                    'skipped',
                  ]),
                  providerRef: ref(r.provider_message_id),
                })),
              }
            )
          } else
            add(`historical_${h.label}`, 'BLOCKED', {
              reason: h.invalid
                ? 'invalid_uuid_selector'
                : h.missingSelector
                  ? 'explicit_historical_id_required'
                  : 'historical_id_not_unique_or_missing',
              matches: count(h.matches),
            })
        }
      }
    } catch {
      add('db_snapshot', 'BLOCKED', {
        reason: 'database_read_failed_no_error_payload_published',
      })
      for (const id of ['db_catalog', ...dbChecks]) {
        if (!checks.some(c => c.id === id))
          add(id, 'BLOCKED', { reason: 'database_read_failed' })
      }
    } finally {
      await sql.end({ timeout: 3 }).catch(() => {})
    }
  }
  await auditProvider(sessions, historical)
  for (const id of [
    'new_real_inbound',
    'new_real_reply',
    'new_handoff',
    'new_optout',
    'new_order_status_notification',
    'worker_timer_target',
  ]) {
    add(id, 'BLOCKED', {
      reason: 'not_executed_by_readonly_audit',
      historicalEvidenceIsNotNewExecution: true,
    })
  }
}

async function auditProvider(sessions: Row[], history: Row[]) {
  const baseText = process.env.WHATSAPP_EVOLUTION_API_BASE_URL
  const key = process.env.WHATSAPP_EVOLUTION_API_KEY
  const session = sessions.filter(s => s.status === 'connected')
  const candidates: {
    label: string
    id: string
    fromMe: boolean
    sessionId: unknown
  }[] = []
  for (const h of history) {
    for (const a of h.delivery ?? [])
      if (a.status === 'succeeded' && typeof a.provider_message_id === 'string')
        candidates.push({
          label: `${h.label}_send`,
          id: a.provider_message_id,
          fromMe: true,
          sessionId: h.event?.session_id,
        })
    if (
      h.inbound?.direction === 'inbound' &&
      typeof h.inbound.provider_message_id === 'string'
    )
      candidates.push({
        label: '134_inbound',
        id: h.inbound.provider_message_id,
        fromMe: false,
        sessionId: h.inbound.session_id,
      })
    for (const r of h.replies ?? [])
      if (typeof r.provider_message_id === 'string')
        candidates.push({
          label: '134_reply',
          id: r.provider_message_id,
          fromMe: true,
          sessionId: r.session_id,
        })
  }
  let base: URL | null = null
  try {
    base = new URL(baseText ?? '')
  } catch {}
  const usable =
    base &&
    base.protocol === 'https:' &&
    !base.username &&
    !base.password &&
    !base.search &&
    !base.hash
  if (!usable || !key || session.length !== 1) {
    for (const id of [
      'provider_connection',
      'provider_webhook',
      'provider_webhook_target',
      'provider_history',
    ])
      add(id, 'BLOCKED', {
        reason:
          !usable || !key
            ? 'provider_env_missing_or_unsafe_base_url'
            : 'single_connected_db_session_required',
      })
    return
  }
  const instance = encodeURIComponent(session[0].provider_session_id)
  async function read(
    id: string,
    route: string,
    inspect: (payload: any) => void,
    body?: unknown
  ) {
    try {
      inspect(await providerRead(base!, key!, route, body))
    } catch (error) {
      add(id, 'BLOCKED', {
        reason: 'provider_read_failed',
        httpStatus: error instanceof ProviderFailure ? error.httpStatus : null,
      })
    }
  }
  await read(
    'provider_connection',
    `/instance/connectionState/${instance}`,
    p => {
      const value = p?.instance?.state ?? p?.state
      add(
        'provider_connection',
        value === 'open'
          ? 'PASS'
          : ['close', 'connecting'].includes(value)
            ? 'FAIL'
            : 'BLOCKED',
        {
          state: state(value, ['open', 'close', 'connecting']),
          databaseConnected: true,
        }
      )
    }
  )
  await read('provider_webhook', `/webhook/find/${instance}`, p => {
    const w = p?.webhook ?? p
    const events: unknown[] = Array.isArray(w?.events) ? w.events : []
    const expected = ['CONNECTION_UPDATE', 'QRCODE_UPDATED', 'MESSAGES_UPSERT']
    const exactEvents =
      events.length === expected.length &&
      expected.every(e => events.includes(e))
    const target = safeUrl(w?.url)
    const headers = w?.headers && typeof w.headers === 'object' ? w.headers : {}
    const authorization = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === 'authorization'
    )?.[1]
    const bypass = Object.keys(headers).some(
      name => name.toLowerCase() === 'x-vercel-protection-bypass'
    )
    const secret = process.env.WHATSAPP_EVOLUTION_WEBHOOK_SECRET
    const secretMatches = secret ? authorization === `Bearer ${secret}` : null
    const knownShape =
      typeof w?.enabled === 'boolean' &&
      typeof w?.webhookByEvents === 'boolean' &&
      typeof w?.webhookBase64 === 'boolean' &&
      Array.isArray(w?.events) &&
      typeof w?.url === 'string'
    const safe =
      w?.enabled === true &&
      w?.webhookByEvents === false &&
      w?.webhookBase64 === false &&
      exactEvents &&
      target?.https === true &&
      target.path === '/api/webhooks/whatsapp/evolution' &&
      !target.hasQuery &&
      !target.hasFragment &&
      !target.hasCredentials
    add(
      'provider_webhook',
      !knownShape
        ? 'BLOCKED'
        : safe && secretMatches === true
          ? 'PASS'
          : safe && secretMatches === null
            ? 'BLOCKED'
            : 'FAIL',
      {
        target,
        enabled: w?.enabled === true,
        byEventsDisabled: w?.webhookByEvents === false,
        base64Disabled: w?.webhookBase64 === false,
        exactEvents,
        secretMatches,
        protectionBypassPresent: bypass,
        recognizedShape: knownShape,
      }
    )
    const expectedUrl = process.env.KAN136_EXPECTED_WEBHOOK_URL
    const expectedTarget = safeUrl(expectedUrl)
    add(
      'provider_webhook_target',
      expectedTarget && target
        ? expectedUrl === w?.url
          ? 'PASS'
          : 'FAIL'
        : 'BLOCKED',
      {
        actual: target,
        expected: expectedTarget,
        reason: expectedTarget
          ? 'explicit_bootstrap_target_comparison'
          : 'expected_target_not_supplied',
        workerTargetNotInferredFromWebhook: true,
      }
    )
  })
  if (!checks.some(c => c.id === 'provider_webhook_target'))
    add('provider_webhook_target', 'BLOCKED', {
      reason: 'webhook_read_unavailable',
    })
  if (!candidates.length)
    add('provider_history', 'BLOCKED', {
      reason: 'no_selected_historical_provider_ids',
    })
  for (const [index, c] of candidates.slice(0, 20).entries()) {
    if (c.sessionId !== session[0].id) {
      add(`provider_history_${index}`, 'BLOCKED', {
        label: c.label,
        providerRef: ref(c.id),
        reason:
          'historical_session_not_identified_as_current_connected_session',
      })
      continue
    }
    await read(
      `provider_history_${index}`,
      `/chat/findMessages/${instance}`,
      p => {
        const rows = records(p)
        const matches = rows?.filter(r => r?.key?.id === c.id) ?? []
        add(
          `provider_history_${index}`,
          !rows || matches.length === 0
            ? 'BLOCKED'
            : matches.length === 1 && matches[0].key?.fromMe === c.fromMe
              ? 'PASS'
              : 'FAIL',
          {
            scope:
              'historical_provider_storage_not_new_transport_or_recipient_receipt',
            label: c.label,
            providerRef: ref(c.id),
            matchingRecords: matches.length,
            expectedFromMe: c.fromMe,
            successfulHttpResponse: true,
            responseShapeRecognized: rows !== null,
            returnedRecords: rows?.length ?? null,
            queryContract:
              'upstream_evolution_2_3_7_where_key_id_not_runtime_version_verification',
            deliveryFailureInferred: false,
            reason: !rows
              ? 'unrecognized_history_shape'
              : matches.length === 0
                ? 'no_matching_historical_record_not_delivery_failure'
                : 'exact_id_and_direction_comparison',
          }
        )
      },
      { where: { key: { id: c.id } }, page: 1, offset: 10 }
    )
  }
  if (candidates.length > 20)
    add('provider_history_limit', 'BLOCKED', {
      omitted: candidates.length - 20,
    })
}

async function main() {
  if (process.argv.includes('--self-test')) {
    const secret = 'private-secret'
    const phone = '+5511900000001'
    const url = safeUrl(
      `https://preview.example/api/webhooks/whatsapp/evolution?key=${secret}#${phone}`
    )
    assert(url?.hasQuery && url.hasFragment)
    assert(
      !JSON.stringify(url).includes(secret) &&
        !JSON.stringify(url).includes(phone)
    )
    assert.equal(
      safeUrl(`https://example/${phone}`)?.path,
      '[noncanonical-path]'
    )
    assert.equal(state(phone, ['open']), 'unrecognized')
    assert.notEqual(ref(phone), phone)
    assert.equal(uuid(phone), false)
    assert.equal(
      records({ messages: { records: [{ key: { id: 'fixture' } }] } })?.length,
      1
    )
    console.log(
      'KAN136 audit self-test: PASS (no DB/provider access, no report written)'
    )
    return
  }
  try {
    await audit()
  } catch {
    add('audit_completion', 'BLOCKED', {
      reason: 'unexpected_failure_no_error_payload_published',
    })
  }
  const summary = Object.fromEntries(
    (['PASS', 'FAIL', 'BLOCKED'] as Status[]).map(status => [
      status,
      checks.filter(c => c.status === status).length,
    ])
  )
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    storeId: STORE,
    mode: 'read_only_real_observation',
    coverage: false,
    newTransportExecuted: false,
    privacy: {
      rawPayloads: false,
      messageBodies: false,
      phoneNumbers: false,
      secrets: false,
      providerIds: 'per_run_hmac_no_key_export',
      fullSnapshotRestorable: false,
    },
    summary,
    checks,
  }
  try {
    await mkdir(dirname(OUTPUT), { recursive: true })
    await writeFile(OUTPUT, JSON.stringify(report, null, 2) + '\n', {
      mode: 0o600,
    })
    console.log(
      `KAN136 backend audit report written. PASS=${summary.PASS} FAIL=${summary.FAIL} BLOCKED=${summary.BLOCKED}`
    )
  } catch {
    console.error('KAN136 report write failed (details withheld)')
    process.exitCode = 1
    return
  }
  process.exitCode = checks.some(c => c.status === 'FAIL')
    ? 1
    : checks.some(c => c.status === 'BLOCKED')
      ? 2
      : 0
}
void main().catch(() => {
  console.error('KAN136 audit failed (details withheld)')
  process.exitCode = 1
})
