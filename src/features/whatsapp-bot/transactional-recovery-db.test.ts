import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  setSystemTime,
  test,
} from 'bun:test'
import { getTableName, type SQL } from 'drizzle-orm'
import { PgDialect, type PgTable } from 'drizzle-orm/pg-core'
import {
  whatsappBotContactsTable,
  whatsappBotConversationsTable,
  whatsappBotDeliveryAttemptsTable,
  whatsappBotMessagesTable,
  whatsappBotSessionsTable,
  whatsappBotTransactionalEventsTable,
  type SelectWhatsappBotTransactionalEvent,
} from '@/services/db/schema'
import type { EvolutionClient } from './evolution-client'
import { getWhatsappRetentionCutoffs } from './security-lgpd-policy'

const mockDb = {}
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
  retained = new Map<PgTable, RetentionRow[]>()
) {
  const selected: string[][] = []
  const claimed: string[] = []
  const deliveryAttempts: Record<string, unknown>[] = []
  const pruneQueries: string[] = []
  const sendTextMessage = mock(
    async (_input: Parameters<EvolutionClient['sendTextMessage']>[0]) => ({
      providerMessageId: 'qa-provider-message',
      status: 'sent',
      raw: {},
    })
  )
  const evolutionClient = { sendTextMessage } as unknown as EvolutionClient

  function prune(table: PgTable, predicate: SQL, values?: Partial<Event>) {
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
    // Fixtures satisfy the non-date retention guards, including unreferenced contacts.
    const stored = retained.get(table) ?? []
    const expired = stored.filter(row => {
      const timestamp = row[definition.key]
      return (
        timestamp instanceof Date &&
        timestamp < expiresBefore &&
        (!storeIds || storeIds.includes(row.storeId))
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
    delete: (table: PgTable) => ({
      where: (predicate: SQL) => ({
        returning: async () => prune(table, predicate),
      }),
    }),
    update: (table: PgTable) => ({
      set: (values: Partial<Event>) => ({
        where: (predicate: SQL) => {
          const execute = () => {
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
    select: () => ({
      from: (table: unknown) => ({
        where: (predicate: SQL) => ({
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
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        expect(table).toBe(whatsappBotDeliveryAttemptsTable)
        deliveryAttempts.push(values)
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
    deleteRows,
    updateRows,
    selectRows,
  }
}

describe('transactional recovery database contract', () => {
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
