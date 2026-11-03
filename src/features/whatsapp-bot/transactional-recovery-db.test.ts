import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  setSystemTime,
  test,
} from 'bun:test'
import { getTableColumns, getTableName, type SQL } from 'drizzle-orm'
import { PgDialect, type PgTable } from 'drizzle-orm/pg-core'
import {
  whatsappBotContactsTable,
  whatsappBotConversationsTable,
  whatsappBotDeliveryAttemptsTable,
  whatsappBotMessagesTable,
  whatsappBotSessionsTable,
  whatsappBotTransactionalEventsTable,
  whatsappRetentionRunsTable,
  type SelectWhatsappRetentionRun,
  type SelectWhatsappBotTransactionalEvent,
} from '@/services/db/schema'
import type { EvolutionClient } from './evolution-client'
import { getWhatsappRetentionCutoffs } from './security-lgpd-policy'

const mockDb = {}
mock.module('server-only', () => ({}))
mock.module('@/services/db', () => ({ db: mockDb }))
const { processWhatsappTransactionalQueue, pruneWhatsappBotRetainedHistory } =
  await import('./db')

const originalMode = process.env.WHATSAPP_BOT_ROLLOUT_MODE
const originalPilotIds = process.env.WHATSAPP_BOT_PILOT_STORE_IDS
const now = new Date('2026-10-08T12:00:00.000Z')
const cutoff = new Date(now.getTime() - 15 * 60_000)
const dialect = new PgDialect()
const column = (name: string) => `"whatsapp_bot_transactional_events"."${name}"`
type Event = SelectWhatsappBotTransactionalEvent
type RetentionRow = {
  id: string
  storeId: number
  status?: string
  metadata?: Record<string, unknown>
  qrCodeExpiresAt?: Date | null
  attemptedAt?: Date
  updatedAt?: Date
  occurredAt?: Date
  lastContactAt?: Date
  eventId?: string
  conversationId?: string
  contactId?: string
  promotionalOptOutAt?: Date | null
}
const retentionDefinitions = [
  {
    table: whatsappBotSessionsTable,
    key: 'qrCodeExpiresAt',
    column: 'qr_code_expires_at',
    cutoff: 'expiredQrCodeBefore',
    status: 'disconnected',
  },
  {
    table: whatsappBotDeliveryAttemptsTable,
    key: 'attemptedAt',
    column: 'attempted_at',
    cutoff: 'deliveryAttemptBefore',
    status: 'failed',
  },
  {
    table: whatsappBotTransactionalEventsTable,
    key: 'updatedAt',
    column: 'updated_at',
    cutoff: 'transactionalEventBefore',
    status: 'sent',
  },
  {
    table: whatsappBotMessagesTable,
    key: 'occurredAt',
    column: 'occurred_at',
    cutoff: 'openConversationBefore',
    status: 'sent',
  },
  {
    table: whatsappBotConversationsTable,
    key: 'updatedAt',
    column: 'updated_at',
    cutoff: 'closedConversationBefore',
    status: 'closed',
  },
  {
    table: whatsappBotContactsTable,
    key: 'lastContactAt',
    column: 'last_contact_at',
    cutoff: 'inactiveContactBefore',
    status: undefined,
  },
] as const

beforeEach(() => {
  setSystemTime(now)
  process.env.WHATSAPP_BOT_ROLLOUT_MODE = 'all'
  delete process.env.WHATSAPP_BOT_PILOT_STORE_IDS
})

afterEach(() => {
  setSystemTime()
  if (originalMode === undefined) delete process.env.WHATSAPP_BOT_ROLLOUT_MODE
  else process.env.WHATSAPP_BOT_ROLLOUT_MODE = originalMode
  if (originalPilotIds === undefined)
    delete process.env.WHATSAPP_BOT_PILOT_STORE_IDS
  else process.env.WHATSAPP_BOT_PILOT_STORE_IDS = originalPilotIds
})

function event(id: string, overrides: Partial<Event> = {}): Event {
  return {
    id,
    storeId: 9,
    conversationId: null,
    contactId: null,
    numberId: 1,
    sessionId: 1,
    orderId: null,
    channel: 'whatsapp',
    eventType: 'manual',
    status: 'processing',
    idempotencyKey: `qa:${id}`,
    recipientPhone: '+5511900000001',
    payload: { text: id },
    attempts: 1,
    maxAttempts: 4,
    nextAttemptAt: now,
    lastError: null,
    processedAt: null,
    sentAt: null,
    createdAt: new Date(now.getTime() - 60 * 60_000),
    updatedAt: new Date(cutoff.getTime() - 1),
    ...overrides,
  }
}

function createDatabaseContract(
  rows: Event[],
  pilotIds?: number[],
  retained = new Map<PgTable, RetentionRow[]>(),
  contacts: {
    storeId: number
    phoneNumber: string
    promotionalOptOutAt: Date | null
  }[] = []
) {
  const selected: string[][] = []
  const claimed: string[] = []
  const deliveryAttempts: Record<string, unknown>[] = []
  const pruneQueries: string[] = []
  const parentLockOrder = [
    whatsappBotContactsTable,
    whatsappBotConversationsTable,
    whatsappBotTransactionalEventsTable,
  ]
  const parentLocks: string[] = []
  const lockedParentIds = new Map<PgTable, string[]>()
  let afterParentsLocked: (() => void) | undefined
  const auditRows = new Map<string, SelectWhatsappRetentionRun>()
  const auditOperations: string[] = []
  const executeSql: string[] = []
  let pruneError: Error | undefined
  const sendTextMessage = mock(
    async (_input: Parameters<EvolutionClient['sendTextMessage']>[0]) => ({
      providerMessageId: 'qa-provider-message',
      status: 'sent',
      raw: {},
    })
  )
  const evolutionClient = { sendTextMessage } as unknown as EvolutionClient

  function lockParents(
    table: PgTable,
    predicate: SQL,
    fields: Record<string, unknown>,
    ordering: unknown[],
    lock: string
  ) {
    expect(lock).toBe('update')
    expect(table).toBe(
      parentLockOrder[parentLocks.length % parentLockOrder.length]
    )
    const idColumn = getTableColumns(table).id
    expect(fields).toEqual({ id: idColumn })
    expect(ordering).toEqual([idColumn])
    expect(executeSql.at(-1)).toBe('select pg_advisory_xact_lock(154, 1)')
    const name = getTableName(table)
    const ref = (key: string) => `"${name}"."${key}"`
    const params: unknown[] = pilotIds ? [...pilotIds] : []
    const clauses = pilotIds
      ? [
          `${ref('store_id')} in (${pilotIds.map((_, index) => `$${index + 1}`).join(', ')})`,
        ]
      : []
    const cutoffs = getWhatsappRetentionCutoffs(now)
    const bind = (value: unknown) => {
      params.push(value)
      return `$${params.length}`
    }
    if (table === whatsappBotContactsTable) {
      clauses.push(
        `${ref('last_contact_at')} < ${bind(cutoffs.inactiveContactBefore.toISOString())}`,
        `${ref('promotional_opt_out_at')} is null`
      )
    } else {
      const statuses =
        table === whatsappBotConversationsTable
          ? ['closed', 'blocked']
          : ['sent', 'discarded']
      clauses.push(`${ref('status')} in (${statuses.map(bind).join(', ')})`)
      if (table === whatsappBotConversationsTable)
        clauses.push(
          `${ref('updated_at')} < ${bind(cutoffs.closedConversationBefore.toISOString())}`
        )
      else {
        const eventDate = bind(cutoffs.transactionalEventBefore.toISOString())
        const attemptDate = bind(cutoffs.deliveryAttemptBefore.toISOString())
        clauses.push(
          `(${ref('updated_at')} < ${eventDate} or exists (select 1 from "whatsapp_bot_delivery_attempts" where "whatsapp_bot_delivery_attempts"."event_id"=${ref('id')} and "whatsapp_bot_delivery_attempts"."store_id"=${ref('store_id')} and "whatsapp_bot_delivery_attempts"."attempted_at" < ${attemptDate}))`
        )
      }
    }
    const query = dialect.sqlToQuery(predicate)
    expect(query.sql.replace(/\s+/g, ' ')).toBe(`(${clauses.join(' and ')})`)
    expect(query.params).toEqual(params)
    const candidates = (retained.get(table) ?? [])
      .filter(row => {
        if (pilotIds && !pilotIds.includes(row.storeId)) return false
        if (table === whatsappBotContactsTable)
          return (
            row.lastContactAt instanceof Date &&
            row.lastContactAt < cutoffs.inactiveContactBefore &&
            row.promotionalOptOutAt == null
          )
        if (table === whatsappBotConversationsTable)
          return (
            ['closed', 'blocked'].includes(row.status ?? '') &&
            row.updatedAt instanceof Date &&
            row.updatedAt < cutoffs.closedConversationBefore
          )
        return (
          ['sent', 'discarded'].includes(row.status ?? '') &&
          ((row.updatedAt instanceof Date &&
            row.updatedAt < cutoffs.transactionalEventBefore) ||
            (retained.get(whatsappBotDeliveryAttemptsTable) ?? []).some(
              attempt =>
                attempt.eventId === row.id &&
                attempt.storeId === row.storeId &&
                attempt.attemptedAt instanceof Date &&
                attempt.attemptedAt < cutoffs.deliveryAttemptBefore
            ))
        )
      })
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const ids = candidates.map(row => row.id)
    lockedParentIds.set(table, ids)
    parentLocks.push(name)
    if (table === whatsappBotTransactionalEventsTable) afterParentsLocked?.()
    return ids.map(id => ({ id }))
  }

  function prune(table: PgTable, predicate: SQL, values?: Partial<Event>) {
    if (pruneError) throw pruneError
    expect(parentLocks.slice(-3)).toEqual(parentLockOrder.map(getTableName))
    const definition = retentionDefinitions.find(item => item.table === table)
    if (!definition)
      throw new Error(`Unexpected retention table: ${getTableName(table)}`)
    const name = getTableName(table)
    pruneQueries.push(name)
    const query = dialect.sqlToQuery(predicate)
    const scopes = [
      ...query.sql.matchAll(
        /"([^"]+)"\."store_id" in \((\$\d+(?:, \$\d+)*)\)/g
      ),
    ].filter(match => match[1] === name)
    expect(scopes).toHaveLength(pilotIds ? 1 : 0)
    const storeIds = scopes[0]
      ? [...scopes[0][2].matchAll(/\$(\d+)/g)].map(
          match => query.params[Number(match[1]) - 1]
        )
      : undefined
    if (pilotIds) expect(storeIds).toEqual(pilotIds)
    const dateClause = `"${name}"."${definition.column}" < $`
    expect(query.sql).toContain(dateClause)
    const dateIndex =
      Number(query.sql.split(dateClause)[1].match(/^\d+/)?.[0]) - 1
    const expiresBefore = new Date(query.params[dateIndex] as string)
    expect(expiresBefore).toEqual(
      getWhatsappRetentionCutoffs(now)[definition.cutoff]
    )
    const ref = (table: PgTable, key: string) =>
      `"${getTableName(table)}"."${key}"`
    const childGuard = (child: PgTable, foreignKey: string) =>
      `not exists (select 1 from "${getTableName(child)}" where ${ref(child, foreignKey)}=${ref(table, 'id')} and ${ref(child, 'store_id')}=${ref(table, 'store_id')})`
    const guards: string[] = []
    if (table === whatsappBotSessionsTable)
      guards.push(`${ref(table, 'status')} <> 'connected'`)
    if (table === whatsappBotDeliveryAttemptsTable)
      guards.push(
        `exists (select 1 from "whatsapp_bot_transactional_events" where ${column('id')}=${ref(table, 'event_id')} and ${column('store_id')}=${ref(table, 'store_id')} and ${column('status')} in ('sent','discarded'))`
      )
    if (table === whatsappBotTransactionalEventsTable)
      guards.push(childGuard(whatsappBotDeliveryAttemptsTable, 'event_id'))
    if (table === whatsappBotMessagesTable)
      guards.push(`${ref(table, 'status')} <> 'queued'`)
    if (table === whatsappBotConversationsTable)
      guards.push(
        childGuard(whatsappBotMessagesTable, 'conversation_id'),
        childGuard(whatsappBotTransactionalEventsTable, 'conversation_id')
      )
    if (table === whatsappBotContactsTable)
      guards.push(
        `${ref(table, 'promotional_opt_out_at')} is null`,
        childGuard(whatsappBotConversationsTable, 'contact_id'),
        childGuard(whatsappBotTransactionalEventsTable, 'contact_id'),
        childGuard(whatsappBotMessagesTable, 'contact_id')
      )
    const expectedParams: unknown[] = pilotIds ? [...pilotIds] : []
    const clauses = pilotIds
      ? [
          `${ref(table, 'store_id')} in (${pilotIds.map((_, index) => `$${index + 1}`).join(', ')})`,
        ]
      : []
    if (
      table === whatsappBotTransactionalEventsTable ||
      table === whatsappBotConversationsTable
    ) {
      clauses.push(
        `${ref(table, 'status')} in ($${expectedParams.length + 1}, $${expectedParams.length + 2})`
      )
      expectedParams.push(
        ...(table === whatsappBotTransactionalEventsTable
          ? ['sent', 'discarded']
          : ['closed', 'blocked'])
      )
    }
    clauses.push(
      `${ref(table, definition.column)} < $${expectedParams.length + 1}`
    )
    expectedParams.push(
      getWhatsappRetentionCutoffs(now)[definition.cutoff].toISOString()
    )
    const lockedTable =
      table === whatsappBotDeliveryAttemptsTable
        ? whatsappBotTransactionalEventsTable
        : parentLockOrder.includes(table as (typeof parentLockOrder)[number])
          ? table
          : undefined
    const lockedIds = lockedTable
      ? lockedParentIds.get(lockedTable)!
      : undefined
    if (lockedIds) {
      const key = table === whatsappBotDeliveryAttemptsTable ? 'event_id' : 'id'
      clauses.push(
        lockedIds.length
          ? `${ref(table, key)} in (${lockedIds.map((_, index) => `$${expectedParams.length + index + 1}`).join(', ')})`
          : 'false'
      )
      expectedParams.push(...lockedIds)
    }
    clauses.push(...guards)
    expect(query.sql.replace(/\s+/g, ' ')).toBe(`(${clauses.join(' and ')})`)
    expect(query.params).toEqual(expectedParams)

    const related = (
      child: PgTable,
      key: 'eventId' | 'conversationId' | 'contactId',
      row: RetentionRow
    ) =>
      (retained.get(child) ?? []).filter(
        item => item[key] === row.id && item.storeId === row.storeId
      )
    const terminal = (row: RetentionRow) =>
      ['sent', 'discarded'].includes(row.status ?? '')
    const stored = retained.get(table) ?? []
    const expired = stored.filter(row => {
      const timestamp = row[definition.key]
      return (
        timestamp instanceof Date &&
        timestamp < expiresBefore &&
        (!storeIds || storeIds.includes(row.storeId)) &&
        (!lockedIds ||
          lockedIds.includes(
            table === whatsappBotDeliveryAttemptsTable ? row.eventId! : row.id
          )) &&
        (table !== whatsappBotSessionsTable || row.status !== 'connected') &&
        (table !== whatsappBotDeliveryAttemptsTable ||
          (retained.get(whatsappBotTransactionalEventsTable) ?? []).some(
            parent =>
              parent.id === row.eventId &&
              parent.storeId === row.storeId &&
              terminal(parent)
          )) &&
        (table !== whatsappBotTransactionalEventsTable ||
          (terminal(row) &&
            !related(whatsappBotDeliveryAttemptsTable, 'eventId', row)
              .length)) &&
        (table !== whatsappBotMessagesTable || row.status !== 'queued') &&
        (table !== whatsappBotConversationsTable ||
          (['closed', 'blocked'].includes(row.status ?? '') &&
            !related(whatsappBotMessagesTable, 'conversationId', row).length &&
            !related(whatsappBotTransactionalEventsTable, 'conversationId', row)
              .length)) &&
        (table !== whatsappBotContactsTable ||
          (row.promotionalOptOutAt == null &&
            !related(whatsappBotConversationsTable, 'contactId', row).length &&
            !related(whatsappBotTransactionalEventsTable, 'contactId', row)
              .length &&
            !related(whatsappBotMessagesTable, 'contactId', row).length))
      )
    })
    if (table === whatsappBotSessionsTable) {
      expect(values).toMatchObject({ qrCodeExpiresAt: null, updatedAt: now })
      for (const row of expired) {
        const metadata = { ...row.metadata }
        delete metadata.qrCode
        Object.assign(row, {
          qrCodeExpiresAt: null,
          metadata,
          updatedAt: values?.updatedAt,
        })
      }
    } else {
      for (const row of expired) stored.splice(stored.indexOf(row), 1)
    }
    return expired.map(row => ({ id: row.id }))
  }

  function assertSelector(predicate: SQL, sql: string, params: unknown[]) {
    const query = dialect.sqlToQuery(predicate)
    const scopes = [
      ...query.sql.matchAll(
        /"whatsapp_bot_transactional_events"\."store_id" in \((\$\d+(?:, \$\d+)*)\)/g
      ),
    ]
    if (!pilotIds) {
      expect(scopes).toHaveLength(0)
      expect(query.sql).toBe(sql)
      expect(query.params).toEqual(params)
      return { params: query.params, storeIds: undefined }
    }

    expect(scopes).toHaveLength(1)
    const scope = scopes[0][0]
    const indexes = [...scope.matchAll(/\$(\d+)/g)].map(
      match => Number(match[1]) - 1
    )
    const storeIds = indexes.map(index => query.params[index])
    expect(storeIds).toEqual(pilotIds)
    const remainingIndexes = query.params
      .map((_, index) => index)
      .filter(index => !indexes.includes(index))
    const coreSql = query.sql
      .replace(`${scope} and `, '')
      .replace(` and ${scope}`, '')
      .replace(
        /\$(\d+)/g,
        (_, index) => `$${remainingIndexes.indexOf(Number(index) - 1) + 1}`
      )
    const coreParams = remainingIndexes.map(index => query.params[index])
    expect(coreSql).toBe(sql)
    expect(coreParams).toEqual(params)
    return { params: coreParams, storeIds }
  }

  const database = {
    execute: async (statement: SQL) => {
      const query = dialect.sqlToQuery(statement)
      expect(query.params).toEqual([])
      const expected = [
        "set local lock_timeout = '10s'",
        "set local statement_timeout = '30s'",
        'select pg_advisory_xact_lock(154, 1)',
      ]
      expect(query.sql).toBe(expected[executeSql.length % expected.length])
      executeSql.push(query.sql)
    },
    delete: (table: PgTable) => ({
      where: (predicate: SQL) => ({
        returning: async () => prune(table, predicate),
      }),
    }),
    update: (table: PgTable) => ({
      set: (values: Partial<Event>) => ({
        where: (predicate: SQL) => {
          const execute = () => {
            if (table === whatsappRetentionRunsTable) {
              const query = dialect.sqlToQuery(predicate)
              expect(query.sql).toBe(
                '(\"whatsapp_retention_runs\".\"id\" = $1 and \"whatsapp_retention_runs\".\"status\" = $2)'
              )
              expect(query.params[1]).toBe('running')
              const row = auditRows.get(query.params[0] as string)
              expect(row?.status).toBe('running')
              Object.assign(row!, values)
              auditOperations.push('finalize')
              return [{ ...row! }]
            }
            if (table === whatsappBotSessionsTable)
              return prune(table, predicate, values)
            expect(table).toBe(whatsappBotTransactionalEventsTable)
            const query = dialect.sqlToQuery(predicate)
            let matches: Event[]

            if (values.lastError?.startsWith('delivery_outcome_unknown:')) {
              const selector = assertSelector(
                predicate,
                `(${column('status')} = $1 and ${column('updated_at')} < $2)`,
                ['processing', cutoff.toISOString()]
              )
              expect(values).toEqual({
                status: 'discarded',
                lastError:
                  'delivery_outcome_unknown: reconcile with provider before retry.',
                updatedAt: now,
              })
              matches = rows.filter(
                row =>
                  row.status === selector.params[0] &&
                  row.updatedAt < new Date(selector.params[1] as string) &&
                  (!selector.storeIds ||
                    selector.storeIds.includes(row.storeId))
              )
            } else {
              matches = rows.filter(
                row =>
                  row.id === query.params[0] && row.storeId === query.params[1]
              )
              if (values.status === 'processing') {
                expect(query.sql).toBe(
                  `(${column('id')} = $1 and ${column('store_id')} = $2 and ${column('status')} = $3 and ${column('updated_at')} = $4 and ${column('attempts')} < ${column('max_attempts')})`
                )
                matches = matches.filter(
                  row =>
                    row.status === query.params[2] &&
                    row.updatedAt.toISOString() === query.params[3] &&
                    row.attempts < row.maxAttempts
                )
                claimed.push(...matches.map(row => row.id))
              }
            }

            for (const row of matches) Object.assign(row, values)
            return matches.map(row => ({ ...row }))
          }
          return {
            returning: async () => execute(),
            then: (resolve: (value: ReturnType<typeof execute>) => unknown) =>
              Promise.resolve(execute()).then(resolve),
          }
        },
      }),
    }),
    select: (fields?: Record<string, unknown>) => ({
      from: (table: unknown) => ({
        where: (predicate: SQL) => {
          if (table === whatsappRetentionRunsTable) {
            const query = dialect.sqlToQuery(predicate)
            expect(query.sql).toBe('"whatsapp_retention_runs"."id" = $1')
            const read = () => {
              const row = auditRows.get(query.params[0] as string)
              return row ? [{ ...row }] : []
            }
            return {
              then: (
                resolve: (value: SelectWhatsappRetentionRun[]) => unknown
              ) => {
                auditOperations.push('read')
                return Promise.resolve(read()).then(resolve)
              },
              for: async (lock: string) => {
                expect(lock).toBe('update')
                expect(executeSql.at(-1)).toBe(
                  'select pg_advisory_xact_lock(154, 1)'
                )
                auditOperations.push('lock')
                return read()
              },
            }
          }
          if (
            fields &&
            Object.hasOwn(fields, 'id') &&
            parentLockOrder.includes(table as (typeof parentLockOrder)[number])
          )
            return {
              orderBy: (...ordering: unknown[]) => ({
                for: async (lock: string) =>
                  lockParents(
                    table as PgTable,
                    predicate,
                    fields,
                    ordering,
                    lock
                  ),
              }),
            }
          return {
            limit: async () => {
              expect(table).toBe(whatsappBotContactsTable)
              const query = dialect.sqlToQuery(predicate)
              expect(query.sql).toBe(
                '("whatsapp_bot_contacts"."store_id" = $1 and "whatsapp_bot_contacts"."phone_number" = $2)'
              )
              return contacts.filter(
                contact =>
                  contact.storeId === query.params[0] &&
                  contact.phoneNumber === query.params[1]
              )
            },
            orderBy: (...ordering: SQL[]) => ({
              limit: async (limit: number) => {
                if (table === whatsappBotSessionsTable) {
                  return [
                    {
                      id: 1,
                      storeId: 9,
                      numberId: 1,
                      status: 'connected',
                      providerSessionId: 'qa-instance',
                      metadata: {},
                    },
                  ]
                }
                expect(table).toBe(whatsappBotTransactionalEventsTable)
                const selector = assertSelector(
                  predicate,
                  `(${column('status')} in ($1, $2) and ${column('attempts')} < ${column('max_attempts')} and ${column('next_attempt_at')} <= $3)`,
                  ['queued', 'failed', now.toISOString()]
                )
                expect(
                  ordering.map(value => dialect.sqlToQuery(value).sql)
                ).toEqual([
                  `${column('next_attempt_at')} asc`,
                  `${column('created_at')} asc`,
                ])
                const eligible = rows
                  .filter(
                    row =>
                      selector.params.slice(0, 2).includes(row.status) &&
                      row.attempts < row.maxAttempts &&
                      row.nextAttemptAt <=
                        new Date(selector.params[2] as string) &&
                      (!selector.storeIds ||
                        selector.storeIds.includes(row.storeId))
                  )
                  .sort(
                    (a, b) =>
                      a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime() ||
                      a.createdAt.getTime() - b.createdAt.getTime()
                  )
                  .slice(0, limit)
                selected.push(eligible.map(row => row.id))
                return eligible.map(row => ({ ...row }))
              },
            }),
          }
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === whatsappRetentionRunsTable)
          return {
            onConflictDoNothing: async () => {
              const id = values.id as string
              if (!auditRows.has(id))
                auditRows.set(id, {
                  status: 'running',
                  counts: null,
                  errorCode: null,
                  startedAt: now,
                  finishedAt: null,
                  ...values,
                } as SelectWhatsappRetentionRun)
              auditOperations.push('start')
            },
          }
        expect(table).toBe(whatsappBotDeliveryAttemptsTable)
        deliveryAttempts.push(values)
        return Promise.resolve()
      },
    }),
  }
  const deleteRows = mock(database.delete)
  const updateRows = mock(database.update)
  const selectRows = mock(database.select)
  Object.assign(mockDb, database, {
    delete: deleteRows,
    update: updateRows,
    select: selectRows,
    transaction: async (callback: (tx: typeof database) => Promise<void>) =>
      callback(database),
  })
  return {
    evolutionClient,
    sendTextMessage,
    selected,
    claimed,
    deliveryAttempts,
    pruneQueries,
    parentLocks,
    lockedParentIds,
    afterParentLocks: (callback: () => void) => {
      afterParentsLocked = callback
    },
    deleteRows,
    updateRows,
    selectRows,
    auditRows,
    auditOperations,
    executeSql,
    failPrune: (error: Error) => {
      pruneError = error
    },
  }
}

describe('transactional recovery database contract', () => {
  test('discards promotion opted out after enqueue, records reason and never retries', async () => {
    const queued = event('late-opt-out', { status: 'queued', attempts: 0 })
    const contacts = [
      {
        storeId: 9,
        phoneNumber: queued.recipientPhone,
        promotionalOptOutAt: null as Date | null,
      },
    ]
    const contract = createDatabaseContract(
      [queued],
      undefined,
      undefined,
      contacts
    )
    contacts[0].promotionalOptOutAt = now
    const first = await processWhatsappTransactionalQueue({
      evolutionClient: contract.evolutionClient,
    })
    const second = await processWhatsappTransactionalQueue({
      evolutionClient: contract.evolutionClient,
    })
    expect(first).toEqual({ processed: 1, sent: 0, failed: 0, discarded: 1 })
    expect(second.processed).toBe(0)
    expect(queued.status).toBe('discarded')
    expect(queued.processedAt).toEqual(now)
    expect(queued.lastError).toContain('promotional_opt_out')
    expect(contract.deliveryAttempts).toHaveLength(1)
    expect(contract.deliveryAttempts[0]).toMatchObject({
      status: 'skipped',
      errorCode: 'promotional_opt_out',
      nextAttemptAt: null,
    })
    expect(contract.sendTextMessage).not.toHaveBeenCalled()
  })

  test.each(['transactional', 'promotional'] as const)(
    'allows %s when opt-out does not apply to this tenant',
    async category => {
      const queued = event('allowed-contact', {
        status: 'queued',
        attempts: 0,
        payload: { text: 'Allowed', notificationCategory: category },
      })
      const contract = createDatabaseContract([queued], undefined, undefined, [
        {
          storeId: category === 'transactional' ? 9 : 10,
          phoneNumber: queued.recipientPhone,
          promotionalOptOutAt: now,
        },
      ])
      const result = await processWhatsappTransactionalQueue({
        evolutionClient: contract.evolutionClient,
      })
      expect(result.sent).toBe(1)
      expect(contract.sendTextMessage).toHaveBeenCalledTimes(1)
    }
  )
  test.each(['pilot', 'all'] as const)(
    '%s applies retention to its scope across all six queries and preserves other history',
    async mode => {
      process.env.WHATSAPP_BOT_ROLLOUT_MODE = mode
      process.env.WHATSAPP_BOT_PILOT_STORE_IDS = '9'
      const retained = new Map<PgTable, RetentionRow[]>()
      const originals = new Map<PgTable, RetentionRow[]>()
      for (const definition of retentionDefinitions) {
        const boundary = getWhatsappRetentionCutoffs(now)[definition.cutoff]
        const fixtures = [
          {
            id: 'qa-expired',
            storeId: 9,
            timestamp: new Date(boundary.getTime() - 1),
          },
          {
            id: 'non-qa-expired',
            storeId: 10,
            timestamp: new Date(boundary.getTime() - 1),
          },
          { id: 'qa-fresh', storeId: 9, timestamp: now },
          { id: 'non-qa-fresh', storeId: 10, timestamp: now },
          { id: 'qa-boundary', storeId: 9, timestamp: boundary },
        ].map(({ timestamp, ...row }) => ({
          ...row,
          status: definition.status,
          [definition.key]: timestamp,
          ...(definition.table === whatsappBotDeliveryAttemptsTable
            ? { eventId: row.id }
            : {}),
          ...(definition.table === whatsappBotSessionsTable
            ? { metadata: { qrCode: { base64: 'qa-qr' }, retainedKey: 'keep' } }
            : {}),
        }))
        retained.set(definition.table, fixtures)
        originals.set(
          definition.table,
          fixtures.map(row => ({ ...row }))
        )
      }
      const contract = createDatabaseContract(
        [],
        mode === 'pilot' ? [9] : undefined,
        retained
      )

      if (mode === 'pilot') {
        const result = await processWhatsappTransactionalQueue({
          evolutionClient: contract.evolutionClient,
        })
        expect(result).toEqual({
          processed: 0,
          sent: 0,
          failed: 0,
          discarded: 0,
        })
      } else {
        const result = await pruneWhatsappBotRetainedHistory({ now })
        expect(result).toEqual({
          expiredQrSessions: 2,
          deletedDeliveryAttempts: 2,
          deletedTransactionalEvents: 2,
          deletedMessages: 2,
          deletedConversations: 2,
          deletedContacts: 2,
        })
      }

      expect(contract.pruneQueries).toEqual(
        retentionDefinitions.map(item => getTableName(item.table))
      )
      expect(contract.parentLocks).toEqual([
        'whatsapp_bot_contacts',
        'whatsapp_bot_conversations',
        'whatsapp_bot_transactional_events',
      ])
      expect(contract.auditOperations).toEqual([
        'start',
        'read',
        'lock',
        'finalize',
      ])
      expect([...contract.auditRows.values()]).toEqual([
        expect.objectContaining({
          status: 'succeeded',
          storeIds: mode === 'pilot' ? [9] : null,
          effectiveAt: now,
          counts: {
            expiredQrSessions: mode === 'pilot' ? 1 : 2,
            deletedDeliveryAttempts: mode === 'pilot' ? 1 : 2,
            deletedTransactionalEvents: mode === 'pilot' ? 1 : 2,
            deletedMessages: mode === 'pilot' ? 1 : 2,
            deletedConversations: mode === 'pilot' ? 1 : 2,
            deletedContacts: mode === 'pilot' ? 1 : 2,
          },
        }),
      ])
      for (const definition of retentionDefinitions) {
        const previous = originals.get(definition.table)!
        const expiredIds =
          mode === 'pilot' ? ['qa-expired'] : ['qa-expired', 'non-qa-expired']
        const expected = previous.flatMap(row => {
          if (!expiredIds.includes(row.id)) return [row]
          if (definition.table !== whatsappBotSessionsTable) return []
          return [
            {
              ...row,
              qrCodeExpiresAt: null,
              updatedAt: now,
              metadata: { retainedKey: 'keep' },
            },
          ]
        })
        expect(retained.get(definition.table)).toEqual(expected)
      }
      expect(contract.sendTextMessage).not.toHaveBeenCalled()
    }
  )

  test('locks recent terminal parents when only their delivery attempts are expired', async () => {
    const retained = new Map<PgTable, RetentionRow[]>([
      [
        whatsappBotTransactionalEventsTable,
        [{ id: 'recent-terminal', storeId: 9, status: 'sent', updatedAt: now }],
      ],
      [
        whatsappBotDeliveryAttemptsTable,
        [
          {
            id: 'old-attempt',
            storeId: 9,
            eventId: 'recent-terminal',
            attemptedAt: new Date('2020-01-01'),
          },
        ],
      ],
    ])
    const contract = createDatabaseContract([], undefined, retained)
    expect(await pruneWhatsappBotRetainedHistory({ now })).toEqual({
      expiredQrSessions: 0,
      deletedDeliveryAttempts: 1,
      deletedTransactionalEvents: 0,
      deletedMessages: 0,
      deletedConversations: 0,
      deletedContacts: 0,
    })
    expect(
      contract.lockedParentIds.get(whatsappBotTransactionalEventsTable)
    ).toEqual(['recent-terminal'])
    expect(retained.get(whatsappBotDeliveryAttemptsTable)).toEqual([])
    expect(retained.get(whatsappBotTransactionalEventsTable)).toEqual([
      { id: 'recent-terminal', storeId: 9, status: 'sent', updatedAt: now },
    ])
    expect(contract.sendTextMessage).not.toHaveBeenCalled()
  })

  test('never deletes newly eligible parents or attempts outside the locked candidate IDs', async () => {
    const retained = new Map<PgTable, RetentionRow[]>()
    const contract = createDatabaseContract([], undefined, retained)
    const old = new Date('2020-01-01')
    contract.afterParentLocks(() => {
      retained.set(whatsappBotContactsTable, [
        { id: 'unlocked-contact', storeId: 9, lastContactAt: old },
      ])
      retained.set(whatsappBotConversationsTable, [
        {
          id: 'unlocked-conversation',
          storeId: 9,
          status: 'closed',
          updatedAt: old,
        },
      ])
      retained.set(whatsappBotTransactionalEventsTable, [
        { id: 'unlocked-event', storeId: 9, status: 'sent', updatedAt: old },
      ])
      retained.set(whatsappBotDeliveryAttemptsTable, [
        {
          id: 'unlocked-attempt',
          storeId: 9,
          eventId: 'unlocked-event',
          attemptedAt: old,
        },
      ])
    })
    expect(await pruneWhatsappBotRetainedHistory({ now })).toEqual({
      expiredQrSessions: 0,
      deletedDeliveryAttempts: 0,
      deletedTransactionalEvents: 0,
      deletedMessages: 0,
      deletedConversations: 0,
      deletedContacts: 0,
    })
    expect([...contract.lockedParentIds.values()]).toEqual([[], [], []])
    for (const table of [
      whatsappBotContactsTable,
      whatsappBotConversationsTable,
      whatsappBotTransactionalEventsTable,
      whatsappBotDeliveryAttemptsTable,
    ])
      expect(retained.get(table)).toHaveLength(1)
    expect(contract.sendTextMessage).not.toHaveBeenCalled()
  })

  test('preserves pending work, recent children, connected QR and opted-out contacts', async () => {
    const old = new Date('2020-01-01T00:00:00.000Z')
    const retained = new Map<PgTable, RetentionRow[]>([
      [
        whatsappBotSessionsTable,
        [
          {
            id: 'connected',
            storeId: 9,
            status: 'connected',
            qrCodeExpiresAt: old,
            metadata: { qrCode: 'keep' },
          },
        ],
      ],
      [
        whatsappBotDeliveryAttemptsTable,
        [
          {
            id: 'pending-attempt',
            storeId: 9,
            eventId: 'pending',
            attemptedAt: old,
          },
          {
            id: 'recent-attempt',
            storeId: 9,
            eventId: 'terminal',
            attemptedAt: now,
          },
        ],
      ],
      [
        whatsappBotTransactionalEventsTable,
        [
          {
            id: 'pending',
            storeId: 9,
            status: 'queued',
            updatedAt: old,
            conversationId: 'pending-conversation',
            contactId: 'event-contact',
          },
          { id: 'terminal', storeId: 9, status: 'sent', updatedAt: old },
        ],
      ],
      [
        whatsappBotMessagesTable,
        [
          {
            id: 'pending-message',
            storeId: 9,
            status: 'queued',
            occurredAt: old,
          },
          {
            id: 'recent-message',
            storeId: 9,
            status: 'sent',
            occurredAt: now,
            conversationId: 'recent-conversation',
            contactId: 'message-contact',
          },
        ],
      ],
      [
        whatsappBotConversationsTable,
        [
          {
            id: 'pending-conversation',
            storeId: 9,
            status: 'closed',
            updatedAt: old,
          },
          {
            id: 'recent-conversation',
            storeId: 9,
            status: 'closed',
            updatedAt: old,
          },
          {
            id: 'active-conversation',
            storeId: 9,
            status: 'open',
            updatedAt: old,
            contactId: 'conversation-contact',
          },
        ],
      ],
      [
        whatsappBotContactsTable,
        [
          'event-contact',
          'message-contact',
          'conversation-contact',
          'opted-out',
        ].map(id => ({
          id,
          storeId: 9,
          lastContactAt: old,
          promotionalOptOutAt: id === 'opted-out' ? old : null,
        })),
      ],
    ])
    const original = structuredClone(
      retentionDefinitions.map(({ table }) => retained.get(table))
    )
    const contract = createDatabaseContract([], undefined, retained)
    const counts = await pruneWhatsappBotRetainedHistory({ now })
    expect(counts).toEqual({
      expiredQrSessions: 0,
      deletedDeliveryAttempts: 0,
      deletedTransactionalEvents: 0,
      deletedMessages: 0,
      deletedConversations: 0,
      deletedContacts: 0,
    })
    expect(
      retentionDefinitions.map(({ table }) => retained.get(table))
    ).toEqual(original)
    expect([...contract.auditRows.values()][0]).toMatchObject({
      status: 'noop',
      counts,
    })
    expect(contract.auditOperations).toEqual([
      'start',
      'read',
      'lock',
      'finalize',
    ])
  })

  test('failed retention is audited and blocks queue selection, claims and sending', async () => {
    const queued = event('blocked-by-retention', {
      status: 'queued',
      attempts: 0,
    })
    const original = { ...queued }
    const contract = createDatabaseContract([queued])
    contract.failPrune(new Error('private database failure'))
    await expect(
      processWhatsappTransactionalQueue({
        evolutionClient: contract.evolutionClient,
      })
    ).rejects.toThrow(
      'WhatsApp retention failed; inspect the private execution audit'
    )
    expect([...contract.auditRows.values()][0]).toMatchObject({
      status: 'failed',
      errorCode: 'prune_failed',
    })
    expect(contract.auditOperations).toEqual([
      'start',
      'read',
      'lock',
      'lock',
      'finalize',
    ])
    expect(contract.selected).toEqual([])
    expect(contract.claimed).toEqual([])
    expect(contract.deliveryAttempts).toEqual([])
    expect(contract.sendTextMessage).not.toHaveBeenCalled()
    expect(queued).toEqual(original)
  })

  test.each(['off', 'pilot'] as const)(
    '%s without an active scope returns zero before pruning or touching the queue',
    async mode => {
      process.env.WHATSAPP_BOT_ROLLOUT_MODE = mode
      process.env.WHATSAPP_BOT_PILOT_STORE_IDS = mode === 'off' ? '9,11' : ''
      const rows = [
        event('uncertain'),
        event('queued', { status: 'queued' }),
        event('failed', { status: 'failed' }),
      ]
      const originals = rows.map(row => ({ ...row }))
      const contract = createDatabaseContract(rows)

      const result = await processWhatsappTransactionalQueue({
        evolutionClient: contract.evolutionClient,
      })

      expect(result).toEqual({ processed: 0, sent: 0, failed: 0, discarded: 0 })
      expect(contract.deleteRows).not.toHaveBeenCalled()
      expect(contract.updateRows).not.toHaveBeenCalled()
      expect(contract.selectRows).not.toHaveBeenCalled()
      expect(contract.deliveryAttempts).toEqual([])
      expect(contract.sendTextMessage).not.toHaveBeenCalled()
      expect(rows).toEqual(originals)
    }
  )

  test('pilot scopes quarantine and eligibility to QA stores without postponing non-pilot events', async () => {
    process.env.WHATSAPP_BOT_ROLLOUT_MODE = 'pilot'
    process.env.WHATSAPP_BOT_PILOT_STORE_IDS = '9,11'
    const stale = [
      event('qa-uncertain'),
      event('other-qa-uncertain', { storeId: 11 }),
    ]
    const queued = event('qa-queued', { status: 'queued', attempts: 0 })
    const outside = [
      event('non-qa-uncertain', { storeId: 10 }),
      event('non-qa-queued', { storeId: 10, status: 'queued', attempts: 0 }),
      event('non-qa-failed', {
        storeId: 10,
        status: 'failed',
        lastError: 'Existing failure',
      }),
      event('non-qa-fresh', { storeId: 10, updatedAt: now }),
    ]
    const originals = outside.map(row => ({ ...row }))
    const contract = createDatabaseContract(
      [...stale, queued, ...outside],
      [9, 11]
    )

    const result = await processWhatsappTransactionalQueue({
      evolutionClient: contract.evolutionClient,
    })

    expect(result).toEqual({ processed: 1, sent: 1, failed: 0, discarded: 2 })
    expect(stale.map(row => row.status)).toEqual(['discarded', 'discarded'])
    expect(contract.selected).toEqual([['qa-queued']])
    expect(contract.claimed).toEqual(['qa-queued'])
    expect(contract.sendTextMessage).toHaveBeenCalledTimes(1)
    expect(contract.deliveryAttempts.map(attempt => attempt.eventId)).toEqual([
      'qa-queued',
    ])
    expect(outside).toEqual(originals)
  })

  test.each(['TimeoutError', 'AbortError', 'TypeError'])(
    '%s after sending is discarded for manual reconciliation and never retried',
    async name => {
      const queued = event('unknown-network-outcome', {
        status: 'queued',
        attempts: 0,
      })
      const contract = createDatabaseContract([queued])
      const error =
        name === 'TypeError'
          ? new TypeError('fetch failed')
          : Object.assign(new Error('Acknowledgement lost'), { name })
      contract.sendTextMessage.mockImplementation(async () => {
        throw error
      })

      const first = await processWhatsappTransactionalQueue({
        evolutionClient: contract.evolutionClient,
      })
      const second = await processWhatsappTransactionalQueue({
        evolutionClient: contract.evolutionClient,
      })

      expect(first).toEqual({ processed: 1, sent: 0, failed: 0, discarded: 1 })
      expect(second).toEqual({ processed: 0, sent: 0, failed: 0, discarded: 0 })
      expect(queued.status).toBe('discarded')
      expect(queued.attempts).toBe(1)
      expect(queued.processedAt).toEqual(now)
      expect(queued.sentAt).toBeNull()
      expect(queued.lastError).toBe(
        'Provider acknowledgement was not received; reconcile before retry.'
      )
      expect(contract.sendTextMessage).toHaveBeenCalledTimes(1)
      expect(contract.deliveryAttempts).toHaveLength(1)
      expect(contract.deliveryAttempts[0]).toMatchObject({
        eventId: queued.id,
        status: 'failed',
        errorCode: 'delivery_outcome_unknown',
        providerMessageId: null,
        nextAttemptAt: null,
      })
      expect(contract.selected).toEqual([[queued.id], []])
    }
  )

  test('quarantines old processing across stores with an unknown-outcome diagnostic and counts every quarantine', async () => {
    const interrupted = [
      event('lost-ack'),
      event('exhausted-claim', {
        storeId: 10,
        attempts: 4,
        nextAttemptAt: new Date(now.getTime() + 60_000),
      }),
    ]
    const originals = interrupted.map(row => ({ ...row }))
    const contract = createDatabaseContract(interrupted)

    const result = await processWhatsappTransactionalQueue({
      limit: 1,
      evolutionClient: contract.evolutionClient,
    })

    expect(result).toEqual({ processed: 0, sent: 0, failed: 0, discarded: 2 })
    interrupted.forEach((row, index) => {
      expect(row).toEqual({
        ...originals[index],
        status: 'discarded',
        updatedAt: now,
        lastError:
          'delivery_outcome_unknown: reconcile with provider before retry.',
      })
    })
    expect(contract.selected).toEqual([[]])
    expect(contract.claimed).toEqual([])
    expect(contract.deliveryAttempts).toEqual([])
    expect(contract.sendTextMessage).not.toHaveBeenCalled()
  })

  test('preserves claims at exactly fifteen minutes and newer, while quarantining one millisecond older', async () => {
    const stale = event('stale')
    const boundary = event('boundary', { updatedAt: cutoff })
    const fresh = event('fresh', { updatedAt: new Date(cutoff.getTime() + 1) })
    const originals = [{ ...boundary }, { ...fresh }]
    const contract = createDatabaseContract([stale, boundary, fresh])

    const result = await processWhatsappTransactionalQueue({
      evolutionClient: contract.evolutionClient,
    })

    expect(result).toEqual({ processed: 0, sent: 0, failed: 0, discarded: 1 })
    expect(stale.status).toBe('discarded')
    expect([boundary, fresh]).toEqual(originals)
    expect(contract.claimed).toEqual([])
    expect(contract.sendTextMessage).not.toHaveBeenCalled()
  })

  test('sends only due queued and retryable failed events and never resends uncertain deliveries on the next run', async () => {
    const uncertain = event('uncertain')
    const queued = event('queued', { status: 'queued', attempts: 0 })
    const failed = event('failed', { status: 'failed' })
    const untouched = [
      event('fresh', { updatedAt: now }),
      event('scheduled', {
        status: 'queued',
        nextAttemptAt: new Date(now.getTime() + 1),
      }),
      event('exhausted', { status: 'failed', attempts: 4 }),
      event('sent', { status: 'sent', updatedAt: now }),
      event('discarded', { status: 'discarded', updatedAt: now }),
    ]
    const originals = untouched.map(row => ({ ...row }))
    const contract = createDatabaseContract([
      uncertain,
      queued,
      failed,
      ...untouched,
    ])

    const first = await processWhatsappTransactionalQueue({
      evolutionClient: contract.evolutionClient,
    })
    const second = await processWhatsappTransactionalQueue({
      evolutionClient: contract.evolutionClient,
    })

    expect(first).toEqual({ processed: 2, sent: 2, failed: 0, discarded: 1 })
    expect(second).toEqual({ processed: 0, sent: 0, failed: 0, discarded: 0 })
    expect(contract.selected).toEqual([['queued', 'failed'], []])
    expect(contract.claimed).toEqual(['queued', 'failed'])
    expect(
      contract.sendTextMessage.mock.calls.map(([input]) => input.text)
    ).toEqual(['queued', 'failed'])
    expect(contract.deliveryAttempts.map(attempt => attempt.eventId)).toEqual([
      'queued',
      'failed',
    ])
    expect([queued.status, failed.status]).toEqual(['sent', 'sent'])
    expect([queued.attempts, failed.attempts, uncertain.attempts]).toEqual([
      1, 2, 1,
    ])
    expect(uncertain.status).toBe('discarded')
    expect(uncertain.lastError).toContain('delivery_outcome_unknown')
    expect(untouched).toEqual(originals)
  })

  test('adds quarantines to normal delivery discards without inventing a delivery attempt for uncertain outcomes', async () => {
    const uncertain = event('uncertain')
    const invalid = event('invalid-payload', {
      status: 'queued',
      attempts: 0,
      payload: {},
    })
    const contract = createDatabaseContract([uncertain, invalid])

    const result = await processWhatsappTransactionalQueue({
      evolutionClient: contract.evolutionClient,
    })

    expect(result).toEqual({ processed: 1, sent: 0, failed: 0, discarded: 2 })
    expect(contract.claimed).toEqual(['invalid-payload'])
    expect(contract.deliveryAttempts).toHaveLength(1)
    expect(contract.deliveryAttempts[0]).toMatchObject({
      eventId: 'invalid-payload',
      status: 'failed',
      errorCode: 'permanent_failure',
    })
    expect(uncertain.lastError).toContain('delivery_outcome_unknown')
    expect(invalid.lastError).toBe('WHATSAPP_TRANSACTIONAL_EMPTY_TEXT')
    expect(contract.sendTextMessage).not.toHaveBeenCalled()
  })
})
