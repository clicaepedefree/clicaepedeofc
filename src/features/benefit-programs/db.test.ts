import { describe, test } from 'bun:test'
import * as bunTest from 'bun:test'
import * as schema from '@/services/db/schema'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PgDialect } from 'drizzle-orm/pg-core'
import { type SQL, eq, sql } from 'drizzle-orm'
import {
  itemsTable,
  storesTable,
  storeBenefitProgramVersionsTable as versions,
  storeSubscriptionsTable,
  storeModuleEntitlementsTable,
  usersTable,
} from '@/services/db/schema'
import {
  unconfiguredBenefitPrograms,
  type BenefitProgramsInput,
} from './policy'

// The repository's minimal bun:test declaration omits the runtime mock API.
const { mock } = bunTest as typeof bunTest & {
  mock: { module(name: string, factory: () => unknown): void }
}
mock.module('server-only', () => ({}))
const fakeDb: Record<string, unknown> = {}
mock.module('@/services/db', () => ({ db: fakeDb }))
const { appendBenefitProgramsConfiguration: append, getBenefitModules } =
  await import('./db')
type Tx = NonNullable<Parameters<typeof append>[3]>
const dialect = new PgDialect()
const empty = (): BenefitProgramsInput => ({
  expectedVersion: 0,
  ...unconfiguredBenefitPrograms(),
})
const migration = readFileSync(
  new URL(
    '../../../supabase/migrations/20261103005958_kan156_benefit_program_versions.sql',
    import.meta.url
  ),
  'utf8'
)

function fixture() {
  const rows: Record<string, unknown>[] = []
  const queries: {
    table: unknown
    sql: string
    params: unknown[]
    lock?: string
  }[] = []
  let tail = Promise.resolve()
  let modules: Record<string, unknown>[] = []
  let productExists = true
  const transaction = async (run: (tx: Tx) => Promise<unknown>) => {
    let release: (() => void) | undefined
    const tx = {
      select: () => ({
        from: (table: unknown) => {
          let predicate: SQL
          const record = (lock?: string) =>
            queries.push({ table, ...dialect.sqlToQuery(predicate), lock })
          const result = () =>
            table === storesTable
              ? [{ id: 9 }]
              : table === versions
                ? rows.filter(row => row.storeId === 9).slice(-1)
                : table === itemsTable
                  ? productExists
                    ? [{ id: 7 }]
                    : []
                  : table === storeModuleEntitlementsTable
                    ? modules
                    : []
          const query = {
            innerJoin: () => query,
            where: (value: SQL) => {
              predicate = value
              return query
            },
            orderBy: () => query,
            limit: async () => {
              record()
              return result()
            },
            for: async (mode: string) => {
              if (table === storesTable) {
                const previous = tail
                tail = new Promise<void>(resolve => {
                  release = resolve
                })
                await previous
              }
              record(mode)
              return result()
            },
            then: (resolve: (rows: unknown[]) => unknown) => {
              record()
              return Promise.resolve(result()).then(resolve)
            },
          }
          return query
        },
      }),
      insert: (table: unknown) => ({
        values: async (value: Record<string, unknown>) => {
          assert.equal(table, versions)
          rows.push(structuredClone(value))
        },
      }),
    }
    try {
      return await run(tx as unknown as Tx)
    } finally {
      release?.()
    }
  }
  Object.assign(fakeDb, { transaction })
  return {
    rows,
    queries,
    transaction,
    setModules(value: typeof modules) {
      modules = value
    },
    missingProduct() {
      productExists = false
    },
  }
}

describe('benefit append transaction', () => {
  test('serializes first writes on store row; exactly one expectedVersion=0 wins', async () => {
    const f = fixture()
    const result = await Promise.allSettled([
      append(9, 'actor', empty()),
      append(9, 'actor', empty()),
    ])
    assert.equal(result.filter(value => value.status === 'fulfilled').length, 1)
    assert.equal(f.rows.length, 1)
    assert.equal(f.queries[0].table, storesTable)
    assert.equal(f.queries[0].lock, 'update')
    assert(f.queries[0].params.includes(9))
    await assert.rejects(append(9, 'actor', empty()), /Recarregue/)
    assert.equal(f.rows.length, 1)
    assert.equal(
      await append(9, 'actor', { ...empty(), expectedVersion: 1 }),
      2
    )
    assert.equal(f.rows[0].version, 1)
    assert.equal(f.rows[1].version, 2)
    assert.equal(f.rows[0].actorUserId, 'actor')
  })
  test('checks inactive modules and foreign/missing product before insert, inside transaction', async () => {
    const f = fixture()
    const value = empty()
    value.cashback = {
      enabled: true,
      percentage: '5',
      expiresAfterDays: 30,
      minimumOrderAmount: '0',
    }
    await assert.rejects(append(9, 'actor', value), /modulo/)
    assert.equal(f.rows.length, 0)
    value.cashback.enabled = false
    value.loyalty.rewardType = 'product'
    value.loyalty.rewardItemId = 7
    f.missingProduct()
    await assert.rejects(append(9, 'actor', value), /catalogo desta loja/)
    const query = f.queries.find(query => query.table === itemsTable)
    assert(query)
    assert.deepEqual(query.params, [7, 9])
    assert.equal(query.lock, 'key share')
    assert.equal(f.rows.length, 0)
  })
  test('reuses effective-module policy; ignores plan-origin entitlement and expired/future grants', async () => {
    const f = fixture()
    const grant = {
      code: 'cashback',
      origin: 'courtesy',
      status: 'active',
      isAdditional: false,
      startsAt: new Date(0),
      endsAt: null,
      revokedAt: null,
    }
    f.setModules([
      { ...grant, origin: 'plan' },
      { ...grant, code: 'loyalty', endsAt: new Date(1) },
    ])
    const modules = await f.transaction(tx => getBenefitModules(9, tx))
    assert.deepEqual(modules, { cashback: false, loyalty: false })
    f.setModules([grant])
    assert.deepEqual(await f.transaction(tx => getBenefitModules(9, tx)), {
      cashback: true,
      loyalty: false,
    })
    f.setModules([{ ...grant, startsAt: new Date('2999-01-01') }])
    assert.deepEqual(await f.transaction(tx => getBenefitModules(9, tx)), {
      cashback: false,
      loyalty: false,
    })
    const query = f.queries.find(
      query => query.table === storeSubscriptionsTable
    )
    assert(query)
    assert(query.sql.includes('starts_at'))
    assert(query.sql.includes('canceled_at'))
    assert(query.params.includes(9))
  })
  test('optional injected transaction does not start/commit a nested transaction', async () => {
    const f = fixture()
    assert.equal(await f.transaction(tx => append(9, 'actor', empty(), tx)), 1)
    assert.equal(f.rows.length, 1)
  })
})

// Explicit opt-in only. Never reads DATABASE_URL/POSTGRES_URL automatically.
// The migration must already exist in the target database; this test never applies it.
// Run: KAN156_TEST_POSTGRES_URL=... bun test --isolate .../db.test.ts
if (process.env.KAN156_TEST_POSTGRES_URL) {
  test('PostgreSQL real: append/CAS/store isolation and immutable history, all fixtures rolled back', async () => {
    const { default: postgres } = await import('postgres')
    const { drizzle } = await import('drizzle-orm/postgres-js')
    const client = postgres(process.env.KAN156_TEST_POSTGRES_URL!, {
      prepare: false,
      max: 1,
    })
    const database = drizzle(client, { schema })
    const rollback = new Error('KAN156_QA_ROLLBACK')
    try {
      await assert.rejects(
        database.transaction(async tx => {
          const suffix = crypto.randomUUID()
          const [store] = await tx
            .insert(storesTable)
            .values({
              name: 'KAN156 rollback QA',
              subdomain: `kan156-${suffix}`,
            })
            .returning()
          const [other] = await tx
            .insert(storesTable)
            .values({
              name: 'KAN156 other QA',
              subdomain: `kan156-other-${suffix}`,
            })
            .returning()
          const [actor] = await tx
            .insert(usersTable)
            .values({ email: `kan156-${suffix}@example.invalid` })
            .returning()
          const [product] = await tx
            .insert(itemsTable)
            .values({ storeId: other.id, name: 'Foreign reward' })
            .returning()
          assert.equal(await append(store.id, actor.id, empty(), tx as Tx), 1)
          await assert.rejects(
            append(store.id, actor.id, empty(), tx as Tx),
            /Recarregue/
          )
          const foreign = { ...empty(), expectedVersion: 1 }
          foreign.loyalty.rewardType = 'product'
          foreign.loyalty.rewardItemId = product.id
          await assert.rejects(
            append(store.id, actor.id, foreign, tx as Tx),
            /catalogo desta loja/
          )
          const [ownProduct] = await tx
            .insert(itemsTable)
            .values({
              storeId: store.id,
              name: 'Historical reward',
            })
            .returning()
          const ownReward = { ...empty(), expectedVersion: 1 }
          ownReward.loyalty.rewardType = 'product'
          ownReward.loyalty.rewardItemId = ownProduct.id
          assert.equal(await append(store.id, actor.id, ownReward, tx as Tx), 2)
          assert.equal(
            await append(
              store.id,
              actor.id,
              { ...empty(), expectedVersion: 2 },
              tx
            ),
            3
          )
          await tx.delete(itemsTable).where(eq(itemsTable.id, ownProduct.id))
          const history = await tx
            .select()
            .from(versions)
            .where(eq(versions.storeId, store.id))
          assert.equal(history.length, 3)
          const historicalReward = history.find(row => row.version === 2)
          assert.equal(historicalReward?.loyaltyRewardItemId, ownProduct.id)
          assert.equal(
            historicalReward?.loyaltyRewardItemName,
            'Historical reward'
          )
          assert(
            history.every(
              row =>
                row.actorUserId === actor.id && row.createdAt instanceof Date
            )
          )
          assert.equal(
            (
              await tx
                .select()
                .from(versions)
                .where(eq(versions.storeId, other.id))
            ).length,
            0
          )
          await tx.execute(sql`savepoint immutable_check`)
          await assert.rejects(
            tx.delete(versions).where(eq(versions.storeId, store.id))
          )
          await tx.execute(sql`rollback to savepoint immutable_check`)
          throw rollback
        }),
        error => error === rollback
      )
    } finally {
      await client.end()
    }
  })
}

// Optional disposable PostgreSQL WASM engine, installed outside the repository.
if (process.env.KAN156_PGLITE_MODULE) {
  test('PostgreSQL engine: migration, RLS/grants, immutable snapshots, cross-store validation and catalog deletion', async () => {
    const { PGlite } = await import(process.env.KAN156_PGLITE_MODULE!)
    const pg = new PGlite()
    try {
      await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE TABLE stores(id integer PRIMARY KEY);
        CREATE TABLE users(id uuid PRIMARY KEY);
        CREATE TABLE items(id integer PRIMARY KEY, store_id integer NOT NULL REFERENCES stores(id), name text NOT NULL);
        INSERT INTO stores VALUES (9), (10);
        INSERT INTO users VALUES ('00000000-0000-0000-0000-000000000001');
        INSERT INTO items VALUES (7,9,'Original reward'), (8,10,'Foreign reward');`)
      await pg.exec(migration)
      const insert = (
        version: number,
        extraColumns = '',
        extraValues = '',
        store = 9
      ) =>
        pg.exec(
          `INSERT INTO store_benefit_program_versions(store_id,version,actor_user_id,cashback_enabled,loyalty_enabled${extraColumns})
        VALUES (${store},${version},'00000000-0000-0000-0000-000000000001',false,false${extraValues})`
        )
      await insert(1)
      await assert.rejects(insert(1))
      await assert.rejects(insert(3))
      await assert.rejects(
        insert(
          2,
          ',loyalty_reward_type,loyalty_reward_item_id',
          ", 'product',8"
        )
      )
      await assert.rejects(insert(2, ',cashback_percentage', ", '1x25'"))
      await assert.rejects(insert(2, ',cashback_percentage', ", '100.01'"))
      await assert.rejects(insert(2, ',loyalty_reward_type', ", 'invalid'"))
      await assert.rejects(insert(2, ',cashback_expires_after_days', ', 0'))
      await insert(
        2,
        ',loyalty_reward_type,loyalty_reward_item_id',
        ", 'product',7"
      )
      await insert(3)
      await pg.exec('DELETE FROM items WHERE id=7')
      const snapshot = await pg.query(
        'SELECT loyalty_reward_item_id, loyalty_reward_item_name FROM store_benefit_program_versions WHERE version=2'
      )
      assert.deepEqual(snapshot.rows, [
        {
          loyalty_reward_item_id: 7,
          loyalty_reward_item_name: 'Original reward',
        },
      ])
      await assert.rejects(
        insert(
          4,
          ',loyalty_reward_type,loyalty_reward_item_id',
          ", 'product',7"
        )
      )
      // Even an explicitly reused ID in another store cannot reinterpret history.
      await pg.exec("INSERT INTO items VALUES (7,10,'Reused identity')")
      await assert.rejects(
        insert(
          4,
          ',loyalty_reward_type,loyalty_reward_item_id',
          ", 'product',7"
        )
      )
      for (const statement of [
        'UPDATE store_benefit_program_versions SET cashback_enabled=true',
        'DELETE FROM store_benefit_program_versions',
        'TRUNCATE store_benefit_program_versions',
      ]) {
        await assert.rejects(pg.exec(statement))
      }
      const result = await pg.query(
        'SELECT version FROM store_benefit_program_versions ORDER BY version'
      )
      assert.deepEqual(result.rows, [
        { version: 1 },
        { version: 2 },
        { version: 3 },
      ])
      for (const role of ['anon', 'authenticated', 'service_role']) {
        await pg.exec(`SET ROLE ${role}`)
        await assert.rejects(
          pg.exec('SELECT * FROM store_benefit_program_versions')
        )
        await assert.rejects(insert(3))
        await assert.rejects(
          pg.exec('UPDATE store_benefit_program_versions SET version=1')
        )
        await assert.rejects(
          pg.exec('DELETE FROM store_benefit_program_versions')
        )
        await pg.exec('RESET ROLE')
      }
      const rls = await pg.query(
        "SELECT relrowsecurity FROM pg_class WHERE oid='store_benefit_program_versions'::regclass"
      )
      assert.equal(rls.rows[0].relrowsecurity, true)
    } finally {
      await pg.close()
    }
  })
}
