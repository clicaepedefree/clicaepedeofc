import { describe, expect, mock, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { getTableName } from 'drizzle-orm'
import type { DbTransaction } from '@/services/db/types'
mock.module('server-only', () => ({}))
mock.module('@/services/db', () => ({ db: {} }))
const { verifyWalletChallenge, consumeWalletRates, readWalletIdentity } =
  await import('./wallet-auth-db')
const { walletHash, walletCodeHash } = await import('./wallet-auth-policy')
const dialect = new PgDialect()
const secret = 'a'.repeat(64),
  challengeId = 'b'.repeat(64),
  bindingHash = 'c'.repeat(64)
const input = {
  secret,
  challengeId,
  storeId: 9,
  phone: '5511900000001',
  bindingHash,
  code: '123456',
  sessionHash: 'd'.repeat(64),
}

function fixture(patch: Record<string, unknown> = {}) {
  const now = new Date('2026-11-03T02:00:00Z')
  const row = {
    idHash: walletHash(challengeId),
    storeId: 9,
    phone: input.phone,
    bindingHash,
    codeHash: walletCodeHash(
      secret,
      challengeId,
      9,
      input.phone,
      bindingHash,
      input.code
    ),
    status: 'sent',
    attempts: 0,
    expiresAt: new Date(now.getTime() + 300000),
    ...patch,
  }
  const writes: { table: string; values: Record<string, unknown> }[] = []
  const queries: { sql: string; params: unknown[] }[] = []
  const tx = {
    execute: async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
      const compiled = dialect.sqlToQuery(query)
      queries.push(compiled)
      return [{ instant: now }]
    },
    select: () => ({
      from: () => ({
        where: (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
          queries.push(dialect.sqlToQuery(query))
          return {
            for: async (mode: string) => {
              expect(mode).toBe('update')
              return [row]
            },
          }
        },
      }),
    }),
    update: (table: Parameters<typeof getTableName>[0]) => ({
      set: (values: Record<string, unknown>) => ({
        where: async () => {
          const name = getTableName(table)
          writes.push({ table: name, values })
          if (name === 'wallet_auth_challenges') Object.assign(row, values)
        },
      }),
    }),
    insert: (table: Parameters<typeof getTableName>[0]) => ({
      values: async (values: Record<string, unknown>) => {
        writes.push({ table: getTableName(table), values })
      },
    }),
  } as unknown as DbTransaction
  return { tx, row, writes, queries }
}

describe('wallet database protocol (in-memory contract, not PostgreSQL proof)', () => {
  test('correct code consumes once and writes only a hashed short-lived session', async () => {
    const f = fixture()
    expect(await verifyWalletChallenge(f.tx, input)).toBe(true)
    expect(await verifyWalletChallenge(f.tx, input)).toBe(false)
    expect(f.row.status).toBe('consumed')
    const session = f.writes.find(
      w => w.table === 'wallet_auth_sessions' && w.values.tokenHash
    )
    expect(session?.values).toMatchObject({
      storeId: 9,
      phone: input.phone,
      bindingHash,
      tokenHash: input.sessionHash,
      expiresAt: new Date('2026-11-03T02:15:00Z'),
    })
    expect(JSON.stringify(f.writes)).not.toContain('123456')
    expect(f.queries[0].params).toContain(walletHash(challengeId))
    expect(f.queries[0].params).not.toContain(challengeId)
  })
  test('fifth wrong attempt locks; correct sixth code does not create a session', async () => {
    const f = fixture()
    for (let n = 0; n < 5; n++)
      expect(
        await verifyWalletChallenge(f.tx, { ...input, code: '000000' })
      ).toBe(false)
    expect(f.row.attempts).toBe(5)
    expect(f.row.status).toBe('locked')
    expect(await verifyWalletChallenge(f.tx, input)).toBe(false)
    expect(f.writes.some(w => w.table === 'wallet_auth_sessions')).toBe(false)
  })
  test('rejects unsent, unknown, expired, consumed, wrong store/phone/browser', async () => {
    for (const patch of [
      { status: 'pending' },
      { status: 'unknown' },
      { status: 'consumed' },
      { status: 'locked' },
      { expiresAt: new Date('2026-11-03T02:00:00Z') },
      { storeId: 10 },
      { phone: '5511900000002' },
      { bindingHash: 'e'.repeat(64) },
    ]) {
      const f = fixture(patch)
      expect(await verifyWalletChallenge(f.tx, input)).toBe(false)
      expect(f.writes).toHaveLength(0)
    }
  })
  test('malformed code also consumes an attempt', async () => {
    const f = fixture()
    expect(await verifyWalletChallenge(f.tx, { ...input, code: '' })).toBe(
      false
    )
    expect(f.row.attempts).toBe(1)
  })
  test('session query scopes token, store, phone, binding, revocation, DB clock and row lock', async () => {
    const f = fixture()
    expect(
      await readWalletIdentity(
        f.tx,
        9,
        input.phone,
        input.sessionHash,
        bindingHash
      )
    ).toEqual({ storeId: 9, phone: input.phone })
    const query = f.queries[0]
    for (const column of [
      'token_hash',
      'store_id',
      'phone',
      'binding_hash',
      'revoked_at',
      'expires_at',
    ])
      expect(query.sql).toContain(column)
    expect(query.sql).toContain('clock_timestamp()')
    expect(query.sql).toContain('is null')
    expect(query.params).toEqual([
      input.sessionHash,
      9,
      input.phone,
      bindingHash,
    ])
  })
  test('rate rows use stable advisory locks and over-budget calls remain counted', async () => {
    const rows = new Map<
      string,
      { key: string; count: number; windowStart: Date; lastAt: Date }
    >()
    const locks: string[] = []
    const instant = new Date('2026-11-03T02:00:00Z')
    const tx = {
      execute: async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
        const q = dialect.sqlToQuery(query)
        if (q.sql.includes('pg_advisory_xact_lock'))
          locks.push(q.params[0] as string)
        return [{ instant }]
      },
      select: () => ({
        from: () => ({
          where: (q: Parameters<PgDialect['sqlToQuery']>[0]) => ({
            for: async () => {
              const row = rows.get(dialect.sqlToQuery(q).params[0] as string)
              return row ? [row] : []
            },
          }),
        }),
      }),
      insert: () => ({
        values: (value: {
          key: string
          count: number
          windowStart: Date
          lastAt: Date
        }) => ({
          onConflictDoUpdate: async () => {
            rows.set(value.key, value)
          },
        }),
      }),
    } as unknown as DbTransaction
    const buckets = [
      { key: 'z:store-ip', seconds: 3600, max: 2 },
      { key: 'a:global', seconds: 3600, max: 100 },
    ]
    expect(await consumeWalletRates(tx, buckets)).toBe(true)
    expect(await consumeWalletRates(tx, buckets)).toBe(true)
    expect(await consumeWalletRates(tx, buckets)).toBe(false)
    expect(rows.get('a:global')?.count).toBe(3)
    expect(locks.slice(0, 2)).toEqual([
      'wallet-rate:a:global',
      'wallet-rate:z:store-ip',
    ])
    instant.setTime(instant.getTime() + 3600000)
    expect(await consumeWalletRates(tx, buckets)).toBe(true)
  })
})
