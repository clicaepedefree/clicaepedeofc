import { describe, expect, mock, test } from 'bun:test'
import { drizzle } from 'drizzle-orm/postgres-js'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import type { DigitalMenuAttribution } from './attribution'

mock.module('server-only', () => ({}))
mock.module('@/services/db', () => ({ db: {} }))
mock.module('@/shared/lib/domain-config', () => ({
  getPublicAppBaseUrl: () => 'https://menu.example.test',
}))
const {
  validateDigitalMenuAttribution,
  recordDigitalMenuAttributionAccess,
  readWhatsappCtaMetrics,
} = await import('./attribution-events')
const dialect = new PgDialect()
const conversationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const messageId = 'assistant:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const visitId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const input: DigitalMenuAttribution = {
  source: 'whatsapp_bot',
  medium: 'assistant',
  campaign: 'digital_menu_cta',
  conversationId,
  messageId,
}
const url = `https://menu.example.test/cardapio/loja?utm_source=whatsapp_bot&utm_medium=assistant&utm_campaign=digital_menu_cta&wa_conversation=${conversationId}&wa_message=${messageId}`
const sentRow = (changes: Record<string, unknown> = {}) => ({
  subdomain: 'loja',
  metadata: { digitalMenuCta: { sent: true, url, ...changes } },
})

// Real Drizzle builders compile every predicate/write; only their execution is replaced.
function fixture(results: unknown[][]) {
  const queries: ReturnType<PgDialect['sqlToQuery']>[] = []
  const orm = drizzle.mock()
  const instrument = (query: any) => {
    query.then = (
      resolve: (rows: unknown[]) => unknown,
      reject: (error: unknown) => unknown
    ) => {
      try {
        queries.push(query.toSQL())
        if (!results.length) throw new Error('Unexpected database query')
        return Promise.resolve(results.shift()!).then(resolve, reject)
      } catch (error) {
        return Promise.reject(error).then(resolve, reject)
      }
    }
    return query
  }
  const database = {
    select: (...args: any[]) => {
      const builder = (orm.select as any)(...args)
      const from = builder.from.bind(builder)
      builder.from = (...tables: any[]) => instrument(from(...tables))
      return builder
    },
    insert: (...args: any[]) => {
      const builder = (orm.insert as any)(...args)
      const values = builder.values.bind(builder)
      builder.values = (...data: any[]) => instrument(values(...data))
      return builder
    },
    update: (...args: any[]) => {
      const builder = (orm.update as any)(...args)
      const set = builder.set.bind(builder)
      builder.set = (...data: any[]) => instrument(set(...data))
      return builder
    },
    execute: async (query: SQL) => {
      queries.push(dialect.sqlToQuery(query))
      if (!results.length) throw new Error('Unexpected execute')
      return results.shift()!
    },
    transaction: async (callback: (tx: unknown) => unknown) =>
      callback(database),
  }
  return {
    database: database as unknown as Parameters<
      typeof recordDigitalMenuAttributionAccess
    >[1],
    queries,
    results,
  }
}

describe('CTA attribution validation', () => {
  test('requires persisted outbound bot message in the same store and conversation', async () => {
    const f = fixture([[sentRow()]])
    expect(
      await validateDigitalMenuAttribution(
        7,
        {
          ...input,
          conversationId: conversationId.toUpperCase(),
          entryUrl: 'https://attacker.test/?phone=private',
        },
        f.database
      )
    ).toEqual(input)
    const query = f.queries[0]
    expect(query.sql).toContain('inner join "whatsapp_bot_conversations"')
    expect(query.sql).toContain(
      '"whatsapp_bot_conversations"."store_id" = "whatsapp_bot_messages"."store_id"'
    )
    expect(query.params).toEqual([
      7,
      conversationId,
      messageId,
      'outbound',
      'bot',
      'sent',
      'delivered',
      'read',
      1,
    ])
    expect(query.sql).not.toContain('"body"')
  })
  test('missing/invalid/legacy message and invalid visit reject without querying', async () => {
    for (const changes of [
      { messageId: undefined },
      { messageId: '+5511900000000' },
      { messageId: 'token' },
      { visitId: 'broken' },
      { messageId: `${messageId}${'x'.repeat(180)}` },
    ]) {
      const f = fixture([])
      expect(
        await validateDigitalMenuAttribution(
          7,
          { ...input, ...changes },
          f.database
        )
      ).toBeNull()
      expect(f.queries).toHaveLength(0)
    }
  })
  test('missing conversation/message evidence rejects', async () => {
    expect(
      await validateDigitalMenuAttribution(7, input, fixture([[]]).database)
    ).toBeNull()
  })
  test('rejects corrupted or forged metadata destinations', async () => {
    for (const changes of [
      { sent: false },
      { sent: 'true' },
      { url: null },
      { url: 'invalid' },
      { url: url.replace('menu.example.test', 'attacker.test') },
      { url: url.replace('/loja?', '/other?') },
      { url: url.replace('https://', 'https://user:password@') },
      { url: `${url}&utm_source=whatsapp_bot` },
      { url: `${url}#private` },
      { url: url.replace('digital_menu_cta', 'wrong') },
      { url: url.replace(messageId, 'other') },
      { url: url.replace(conversationId, visitId) },
    ])
      expect(
        await validateDigitalMenuAttribution(
          7,
          input,
          fixture([[sentRow(changes)]]).database
        )
      ).toBeNull()
    for (const metadata of [null, [], {}, { digitalMenuCta: [] }]) {
      expect(
        await validateDigitalMenuAttribution(
          7,
          input,
          fixture([[{ subdomain: 'loja', metadata }]]).database
        )
      ).toBeNull()
    }
  })
  test('visit is normalized and must match complete retained context, never bypasses CTA evidence', async () => {
    const f = fixture([[sentRow()], [{ id: visitId }]])
    expect(
      await validateDigitalMenuAttribution(
        7,
        { ...input, visitId: visitId.toUpperCase() },
        f.database
      )
    ).toEqual({ ...input, visitId })
    expect(f.queries[1].params).toEqual([
      visitId,
      7,
      conversationId,
      messageId,
      1,
    ])
    expect(f.queries[1].sql).toContain("CURRENT_TIMESTAMP - interval '30 days'")
    expect(
      await validateDigitalMenuAttribution(
        7,
        { ...input, visitId },
        fixture([[sentRow()], []]).database
      )
    ).toBeNull()
    expect(
      await validateDigitalMenuAttribution(
        7,
        { ...input, visitId },
        fixture([[]]).database
      )
    ).toBeNull()
  })
})

describe('consented CTA events', () => {
  const event = {
    storeId: 7,
    attribution: input,
    visitId,
    stage: 'access' as const,
  }
  const authorizedFixture = (rows: unknown[][]) =>
    fixture([[sentRow()], ...rows])
  const record = async (
    value: Parameters<typeof recordDigitalMenuAttributionAccess>[0],
    f: ReturnType<typeof fixture>
  ) => {
    const result = await recordDigitalMenuAttributionAccess(value, f.database)
    expect(f.queries.shift()?.sql).toContain('"whatsapp_bot_messages"')
    return result
  }
  test('new access locks quota atomically, inserts only minimal data, then reads exact context', async () => {
    const f = authorizedFixture([
      [],
      [],
      [{ count: 99 }],
      [],
      [{ id: visitId }],
    ])
    expect(await record({ ...event, visitId: visitId.toUpperCase() }, f)).toBe(
      visitId
    )
    expect(f.queries[0].sql).toContain(
      'pg_advisory_xact_lock(hashtextextended('
    )
    expect(f.queries[0].params).toEqual([`digital-menu-cta:7:${messageId}`])
    expect(f.queries[2].sql).toContain(
      "CURRENT_TIMESTAMP - interval '24 hours'"
    )
    const insert = f.queries[3]
    expect(insert.sql).toContain('on conflict ("id") do nothing')
    expect(insert.params).toEqual([visitId, 7, conversationId, messageId])
    expect(insert.sql).toContain('default, default')
    expect(f.queries[4].params).toEqual([
      visitId,
      7,
      conversationId,
      messageId,
      1,
    ])
    expect(f.results).toHaveLength(0)
  })
  test('existing retry bypasses quota and never rewrites createdAt', async () => {
    const f = authorizedFixture([[], [{ id: visitId }]])
    expect(await record(event, f)).toBe(visitId)
    expect(f.queries).toHaveLength(2)
  })
  test('100 visits exhaust quota without insert', async () => {
    const f = authorizedFixture([[], [], [{ count: 100 }]])
    expect(await record(event, f)).toBeNull()
    expect(f.queries).toHaveLength(3)
  })
  test('global UUID collision across store/conversation/message does not attach context', async () => {
    const f = authorizedFixture([[], [], [{ count: 1 }], [], []])
    expect(await record(event, f)).toBeNull()
    expect(f.queries[4].params).toEqual([
      visitId,
      7,
      conversationId,
      messageId,
      1,
    ])
    expect(f.queries.every(q => !q.sql.includes('do update'))).toBe(true)
  })
  test('cart only updates a retained matching record with null cartAt; retries read existing row', async () => {
    for (const row of [[{ id: visitId }], []]) {
      const f = authorizedFixture([[], row])
      expect(await record({ ...event, stage: 'cart' }, f)).toBe(
        row.length ? visitId : null
      )
      expect(f.queries[0].sql).toContain('"cart_at" = CURRENT_TIMESTAMP')
      expect(f.queries[0].sql).toContain('"cart_at" is null')
      expect(f.queries[0].params).toEqual([
        visitId,
        7,
        conversationId,
        messageId,
      ])
      expect(f.queries[0].sql).toContain("interval '30 days'")
      expect(f.queries.every(q => !q.sql.includes('insert'))).toBe(true)
    }
  })
  test('rejects invalid UUID and conflicting attribution visit without writes', async () => {
    const f = fixture([])
    expect(
      await recordDigitalMenuAttributionAccess(
        { ...event, visitId: 'phone' },
        f.database
      )
    ).toBeNull()
    expect(
      await recordDigitalMenuAttributionAccess(
        { ...event, attribution: { ...input, visitId: conversationId } },
        f.database
      )
    ).toBeNull()
    expect(f.queries).toHaveLength(0)
  })
  test('direct helper cannot write an access without issued CTA evidence', async () => {
    for (const rows of [[], [sentRow({ sent: false })]]) {
      const f = fixture([rows])
      expect(
        await recordDigitalMenuAttributionAccess(event, f.database)
      ).toBeNull()
      expect(f.queries).toHaveLength(1)
      expect(f.queries[0].sql).not.toMatch(/insert into|update /)
    }
  })
})

describe('CTA aggregate metrics SQL contract', () => {
  test('returns only aggregates, preserving decimal precision and legacy no-access totals', async () => {
    const totals = {
      accesses: 100,
      carts: 12,
      ordersCreated: 8,
      ordersCompleted: 5,
      ordersCancelled: 1,
      completedRevenue: '999999999999999.1234',
      otherIntegrationOrders: 17,
      attributedOrdersWithoutAccess: 3,
    }
    const f = fixture([[{ ...totals, id: 'must-not-leak' }]])
    expect(
      await readWhatsappCtaMetrics(
        7,
        {
          startDate: '2026-11-01',
          endDate: '2026-11-03',
          timeZone: 'America/Sao_Paulo',
        },
        f.database
      )
    ).toEqual({ ...totals, retentionDays: 30 })
    const q = f.queries[0]
    expect(q.sql).toContain(
      "created_at >= CURRENT_TIMESTAMP - interval '30 days'"
    )
    expect(q.sql).toContain('count(distinct o.id)')
    expect(q.sql).toContain('not exists')
    expect(q.sql).toContain("s.customer_snapshot->'attribution'")
    expect(q.sql).toContain("o.snapshot->'attribution'")
    expect(q.sql).toContain("a.id::text = lower(o.attribution->>'visitId')")
    expect(q.sql).toContain("a.message_id = o.attribution->>'messageId'")
    expect(q.sql).toContain("o.status = 'COMPLETED'")
    expect(q.sql).not.toContain('join')
    expect(q.sql).toContain('o.created_at >=')
    expect(q.sql).toContain('cart_at >=')
    expect(q.sql).toContain("interval '1 day'")
    expect(q.sql).toContain(
      "'pos', 'manual', 'digital_menu', 'cardapio-digital'"
    )
    expect(q.params).toContain('whatsapp-bot-digital-menu-cta')
    expect(q.params).toContain('America/Sao_Paulo')
    expect(q.params).toContain(7)
  })
  test('all-time still applies access TTL; invalid range or timezone rejects before SQL', async () => {
    const f = fixture([[{}]])
    await readWhatsappCtaMetrics(7, { timeZone: 'UTC' }, f.database)
    expect(f.queries[0].sql).toContain("interval '30 days'")
    for (const options of [
      { startDate: '2026-02-30', endDate: '2026-03-01', timeZone: 'UTC' },
      { timeZone: 'bad/timezone' },
    ]) {
      const bad = fixture([])
      await expect(
        readWhatsappCtaMetrics(7, options, bad.database)
      ).rejects.toThrow()
      expect(bad.queries).toHaveLength(0)
    }
  })
})

test('migration has global UUID PK, server defaults, tenant cascade and denied API roles', async () => {
  const migration = await Bun.file(
    new URL(
      '../../../supabase/migrations/20261106044322_kan89_digital_menu_attribution_accesses.sql',
      import.meta.url
    )
  ).text()
  expect(migration).toContain('id uuid PRIMARY KEY')
  expect(migration).toContain('DEFAULT CURRENT_TIMESTAMP')
  expect(migration).toContain('FOREIGN KEY (conversation_id, store_id)')
  expect(migration).toContain(
    'REFERENCES public.whatsapp_bot_conversations(id, store_id) ON DELETE CASCADE'
  )
  expect(migration).toContain('FORCE ROW LEVEL SECURITY')
  expect(migration).toContain('FROM PUBLIC, anon, authenticated, service_role')
  expect(migration).not.toContain('SECURITY DEFINER')
  expect(migration).not.toMatch(/\b(ip|user_agent|entry_url)\s+(text|inet)/i)
})
