import { describe, test } from 'bun:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { and, eq, sql } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/pg-core'
import * as schema from '@/services/db/schema'
import type { DbTransaction } from '@/services/db/types'
import type * as Engine from './ledger'

const migration = readFileSync(
  new URL(
    '../../../supabase/migrations/20261103013906_kan152_benefit_ledger.sql',
    import.meta.url
  ),
  'utf8'
)
const tables = [
  schema.benefitAccountsTable,
  schema.benefitCapturesTable,
  schema.benefitCyclesTable,
  schema.benefitGrantsTable,
  schema.benefitLotsTable,
  schema.benefitDebitsTable,
  schema.benefitAllocationsTable,
  schema.benefitEventsTable,
]

describe('KAN152 persistence contract', () => {
  test('migration covers every typed ledger table, denies Data API, and guards audit even for backend writes', () => {
    for (const table of tables) {
      const config = getTableConfig(table)
      assert(migration.includes(`CREATE TABLE public.${config.name} (`))
      assert(migration.includes(`'${config.name}'`))
      assert(config.foreignKeys.length > 0)
    }
    assert(migration.includes('ENABLE ROW LEVEL SECURITY'))
    assert(
      migration.includes(
        'REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role'
      )
    )
    assert(migration.includes('BEFORE UPDATE OR DELETE'))
    assert(migration.includes('BEFORE TRUNCATE'))
    assert(migration.includes('SECURITY INVOKER SET search_path'))
    assert(!migration.includes('SECURITY DEFINER'))
    assert(!migration.includes('REFERENCES public.items'))
  })
  test('financial projections have conservation checks and composite isolation keys', () => {
    const lots = getTableConfig(schema.benefitLotsTable)
    assert(lots.checks.some(check => check.name === 'benefit_lot_conservation'))
    assert(
      lots.foreignKeys.some(
        fk =>
          fk
            .reference()
            .columns.map(c => c.name)
            .join(',') === 'grant_id,account_id,store_id'
      )
    )
    const allocation = getTableConfig(schema.benefitAllocationsTable)
    assert(
      allocation.foreignKeys.some(
        fk =>
          fk
            .reference()
            .columns.map(c => c.name)
            .join(',') === 'order_id,account_id,store_id'
      )
    )
    assert.equal(
      getTableConfig(schema.benefitEventsTable).columns.some(
        c => c.name === 'phone'
      ),
      false
    )
    assert.equal(
      getTableConfig(schema.benefitCapturesTable).columns.some(
        c => c.name === 'phone'
      ),
      false
    )
  })
})

// Explicit opt-in ONLY. No DATABASE_URL/.env fallback, no migrations applied,
// no external services. Use a PostgreSQL QA database with existing migrations.
// Every fixture and assertion runs in one transaction and is rolled back.
// KAN152_TEST_POSTGRES_URL=... bun test --isolate .../ledger.test.ts
type Fixture = {
  tx: DbTransaction
  engine: typeof Engine
  store: typeof schema.storesTable.$inferSelect
  other: typeof schema.storesTable.$inferSelect
  phone: string
  configure: (
    patch?: Partial<typeof schema.storeBenefitProgramVersionsTable.$inferInsert>
  ) => Promise<void>
  order: (
    patch?: Partial<typeof schema.ordersTable.$inferInsert>,
    capture?: boolean
  ) => Promise<schema.SelectOrder>
  status: (
    order: schema.SelectOrder,
    status: schema.SelectOrder['status']
  ) => Promise<schema.SelectOrder>
  balance: () => ReturnType<typeof Engine.getBenefitAccountSummary>
}

function postgresTest(name: string, run: (f: Fixture) => Promise<void>) {
  if (!process.env.KAN152_TEST_POSTGRES_URL) return
  const pgTest = test as (
    name: string,
    fn: () => Promise<void>,
    timeout: number
  ) => void
  pgTest(
    `PostgreSQL rollback: ${name}`,
    async () => {
      const { mock } = (await import(
        'bun:test'
      )) as unknown as typeof import('bun:test') & {
        mock: { module(name: string, factory: () => unknown): void }
      }
      mock.module('server-only', () => ({}))
      const { default: postgres } = await import('postgres')
      const { drizzle } = await import('drizzle-orm/postgres-js')
      const engine = await import('./ledger')
      const client = postgres(process.env.KAN152_TEST_POSTGRES_URL!, {
        prepare: false,
        max: 1,
      })
      const database = drizzle(client, { schema })
      const rollback = new Error('KAN152_EXPECTED_ROLLBACK')
      try {
        await assert.rejects(
          database.transaction(async tx => {
            const suffix = crypto.randomUUID()
            const [store] = await tx
              .insert(schema.storesTable)
              .values({
                name: 'KAN152 rollback',
                subdomain: `kan152-${suffix}`,
              })
              .returning()
            const [other] = await tx
              .insert(schema.storesTable)
              .values({
                name: 'KAN152 other',
                subdomain: `kan152-other-${suffix}`,
              })
              .returning()
            const [actor] = await tx
              .insert(schema.usersTable)
              .values({ email: `kan152-${suffix}@example.invalid` })
              .returning()
            for (const code of ['cashback', 'loyalty']) {
              await tx
                .insert(schema.billingModulesTable)
                .values({ code, name: code })
                .onConflictDoNothing()
              const [module] = await tx
                .select()
                .from(schema.billingModulesTable)
                .where(eq(schema.billingModulesTable.code, code))
              assert.equal(
                module.status,
                'active',
                `QA requires active module ${code}`
              )
              await tx.insert(schema.storeModuleEntitlementsTable).values({
                storeId: store.id,
                moduleId: module.id,
                origin: 'courtesy',
                reason: 'KAN152 rollback test',
              })
            }
            let version = 0
            const configure: Fixture['configure'] = async (patch = {}) => {
              await tx.insert(schema.storeBenefitProgramVersionsTable).values({
                storeId: store.id,
                version: ++version,
                actorUserId: actor.id,
                cashbackEnabled: true,
                cashbackPercentage: '10',
                cashbackExpiresAfterDays: 30,
                cashbackMinimumOrderAmount: '0.00',
                loyaltyEnabled: false,
                loyaltyRequiredOrders: 2,
                loyaltyMinimumOrderAmount: '0.00',
                loyaltyRewardType: 'cashback',
                loyaltyRewardAmount: '5.00',
                loyaltyRewardExpiresAfterDays: 30,
                ...patch,
              })
            }
            const phone = '11987654321'
            const order: Fixture['order'] = async (
              patch = {},
              capture = true
            ) => {
              const [stored] = await tx
                .insert(schema.ordersTable)
                .values({
                  storeId: store.id,
                  displayId: crypto.randomUUID(),
                  type: 'TAKEOUT',
                  salesChannel: 'DIGITAL_MENU',
                  status: 'CREATED',
                  totalPrice: '100.00',
                  customerPhone: phone,
                  snapshot: {
                    benefits: {
                      cashback: { amount: '9999.99', balance: '999999' },
                    },
                  },
                  ...patch,
                })
                .returning()
              if (capture) await engine.captureOrderBenefits(stored, tx)
              return stored
            }
            const status: Fixture['status'] = async (stored, next) => {
              const [updated] = await tx
                .update(schema.ordersTable)
                .set({ status: next })
                .where(eq(schema.ordersTable.id, stored.id))
                .returning()
              await engine.settleOrderBenefits(updated, tx)
              return updated
            }
            await configure()
            await run({
              tx,
              engine,
              store,
              other,
              phone,
              configure,
              order,
              status,
              balance: () =>
                engine.getBenefitAccountSummary(store.id, phone, tx),
            })
            throw rollback
          }),
          error => error === rollback
        )
      } finally {
        await client.end()
      }
    },
    180000
  )
}

if (!process.env.KAN152_TEST_POSTGRES_URL) {
  ;(test as typeof test & { skip: typeof test }).skip(
    'PostgreSQL real ledger suite requires explicit KAN152_TEST_POSTGRES_URL (no mocked ledger)',
    () => {}
  )
}

postgresTest(
  'server snapshots are pinned; pending, completed, repeated settlement and identity mutation',
  async f => {
    const first = await f.order({ totalPrice: '105.99', deliveryFee: '5.00' })
    assert.equal((await f.balance()).availableAmount, '0.00')
    assert.equal((await f.balance()).pendingAmount, '10.09')
    assert.equal(
      await f.engine.getOrderBenefitNotificationData(
        first.id,
        f.store.id,
        f.tx
      ),
      null
    )
    await f.configure({ cashbackPercentage: '99' })
    await f.tx
      .update(schema.ordersTable)
      .set({ customerPhone: '21987654321', totalPrice: '99999.00' })
      .where(eq(schema.ordersTable.id, first.id))
    await f.status(first, 'COMPLETED')
    await f.status(first, 'COMPLETED')
    assert.equal((await f.balance()).availableAmount, '10.09')
    assert.equal((await f.balance()).pendingAmount, '0.00')
    const notification = await f.engine.getOrderBenefitNotificationData(
      first.id,
      f.store.id,
      f.tx
    )
    assert.equal(notification?.customerPhone, '5511987654321')
    assert.equal(notification?.grants[0].earnedAmount, '10.09')
    assert.equal(
      (await f.engine.getBenefitAccountSummary(f.other.id, f.phone, f.tx))
        .availableAmount,
      '0.00'
    )
    const [snapshot] = await f.tx
      .select()
      .from(schema.benefitCapturesTable)
      .where(eq(schema.benefitCapturesTable.orderId, first.id))
    assert.equal(snapshot.ruleVersion, 1)
    assert.equal(snapshot.baseAmount, '100.99')
    assert.equal(snapshot.cashbackSpent, '0.00')
  }
)

postgresTest(
  'trusted creation already COMPLETED works; historical, POS, invalid phone and indoor never backfill',
  async f => {
    const first = await f.order({ status: 'COMPLETED' })
    await f.engine.settleOrderBenefits(first, f.tx)
    assert.equal((await f.balance()).availableAmount, '10.00')
    const historical = await f.order({}, false)
    await f.status(historical, 'COMPLETED')
    for (const patch of [
      { salesChannel: 'POS' as const },
      { type: 'INDOOR' as const },
      { customerPhone: '123' },
    ]) {
      const rejected = await f.order(patch)
      await f.status(rejected, 'COMPLETED')
      const captured = await f.tx
        .select()
        .from(schema.benefitCapturesTable)
        .where(eq(schema.benefitCapturesTable.orderId, rejected.id))
      assert.equal(captured.length, 0)
    }
    const fixedPhone = await f.order({ customerPhone: '+55 (11) 3456-7890' })
    await f.status(fixedPhone, 'COMPLETED')
    assert.equal(
      (await f.engine.getBenefitAccountSummary(f.store.id, '1134567890', f.tx))
        .availableAmount,
      '10.00'
    )
    assert.equal((await f.balance()).availableAmount, '10.00')
  }
)

postgresTest(
  'pending rejection and out-of-order completion cannot resurrect a reversed grant',
  async f => {
    const first = await f.order()
    await f.status(first, 'REJECTED')
    await f.status(first, 'REJECTED')
    await f.status(first, 'COMPLETED')
    assert.equal((await f.balance()).availableAmount, '0.00')
    assert.equal((await f.balance()).pendingAmount, '0.00')
  }
)

postgresTest(
  'spent gain cancellation becomes debt; only future gains offset, refund restores exact wallet and is idempotent',
  async f => {
    const first = await f.order()
    await f.status(first, 'COMPLETED')
    const debit = await f.order({}, false)
    await f.engine.debitOrderBenefitBalance(
      debit,
      '+55 11 98765-4321',
      '7.00',
      f.tx
    )
    await f.engine.debitOrderBenefitBalance(debit, f.phone, '7.00', f.tx)
    await assert.rejects(
      f.engine.debitOrderBenefitBalance(debit, f.phone, '6.00', f.tx),
      /conflict/
    )
    await f.status(first, 'CANCELLED') // Engine QA only: no new terminal UI flow.
    await f.status(first, 'CANCELLED')
    assert.equal((await f.balance()).availableAmount, '0.00')
    assert.equal((await f.balance()).adjustmentDebt, '7.00')
    const next = await f.order({ totalPrice: '50.00' })
    await f.status(next, 'COMPLETED')
    assert.equal((await f.balance()).adjustmentDebt, '2.00')
    assert.equal(
      await f.engine.getOrderBenefitNotificationData(next.id, f.store.id, f.tx),
      null
    )
    const cancelledDebit = await f.status(debit, 'CANCELLED')
    await f.engine.refundOrderBenefitBalance(cancelledDebit, f.tx)
    await f.engine.refundOrderBenefitBalance(cancelledDebit, f.tx)
    assert.equal((await f.balance()).availableAmount, '7.00')
    assert.equal((await f.balance()).adjustmentDebt, '2.00')
  }
)

postgresTest(
  'debit precedes capture, server spending reduces gain and later new allocations fail closed',
  async f => {
    const seed = await f.order({ totalPrice: '1000.00' })
    await f.status(seed, 'COMPLETED')
    const spend = await f.order({ totalPrice: '100.00' }, false)
    await f.engine.debitOrderBenefitBalance(spend, f.phone, '40.00', f.tx)
    await f.engine.captureOrderBenefits(spend, f.tx)
    await f.engine.debitOrderBenefitBalance(spend, f.phone, '40.00', f.tx)
    await f.status(spend, 'COMPLETED')
    const [capture] = await f.tx
      .select()
      .from(schema.benefitCapturesTable)
      .where(eq(schema.benefitCapturesTable.orderId, spend.id))
    const [gain] = await f.tx
      .select()
      .from(schema.benefitGrantsTable)
      .where(
        and(
          eq(schema.benefitGrantsTable.orderId, spend.id),
          eq(schema.benefitGrantsTable.kind, 'cashback')
        )
      )
    assert.equal(capture.baseAmount, '60.00')
    assert.equal(capture.cashbackSpent, '40.00')
    assert.equal(gain.amount, '6.00')
    const captured = await f.order()
    const before = await f.balance()
    await assert.rejects(
      f.engine.debitOrderBenefitBalance(captured, f.phone, '1.00', f.tx),
      /precede immutable capture/
    )
    assert.deepEqual(await f.balance(), before)
    assert.equal(
      (
        await f.tx
          .select()
          .from(schema.benefitDebitsTable)
          .where(eq(schema.benefitDebitsTable.orderId, captured.id))
      ).length,
      0
    )
    const tooSmall = await f.order({ totalPrice: '10.00' }, false)
    await assert.rejects(
      f.engine.debitOrderBenefitBalance(tooSmall, f.phone, '10.01', f.tx),
      /exceeds server order total/
    )
    assert.equal(
      (
        await f.tx
          .select()
          .from(schema.benefitDebitsTable)
          .where(eq(schema.benefitDebitsTable.orderId, tooSmall.id))
      ).length,
      0
    )
    const fullyPaid = await f.order(
      { totalPrice: '50.00', deliveryFee: '5.00' },
      false
    )
    await f.engine.debitOrderBenefitBalance(fullyPaid, f.phone, '50.00', f.tx)
    await f.engine.captureOrderBenefits(fullyPaid, f.tx)
    const [fullCapture] = await f.tx
      .select()
      .from(schema.benefitCapturesTable)
      .where(eq(schema.benefitCapturesTable.orderId, fullyPaid.id))
    assert.equal(fullCapture.baseAmount, '0.00')
    assert.equal(fullCapture.cashbackSpent, '50.00')
  }
)

postgresTest(
  'refund of six with adjustment debt ten is exact wallet six/debt ten, not a future gain',
  async f => {
    const seed = await f.order()
    await f.status(seed, 'COMPLETED')
    const spend = await f.order({}, false)
    await f.engine.debitOrderBenefitBalance(spend, f.phone, '6.00', f.tx)
    const [account] = await f.tx
      .select()
      .from(schema.benefitAccountsTable)
      .where(eq(schema.benefitAccountsTable.storeId, f.store.id))
    await f.tx
      .update(schema.benefitAccountsTable)
      .set({ adjustmentDebt: '10.00' })
      .where(eq(schema.benefitAccountsTable.id, account.id))
    // Consume remaining four separately so the oracle isolates the six returned.
    const otherSpend = await f.order({}, false)
    await f.engine.debitOrderBenefitBalance(otherSpend, f.phone, '4.00', f.tx)
    const cancelled = await f.status(spend, 'CANCELLED')
    await f.engine.refundOrderBenefitBalance(cancelled, f.tx)
    assert.equal((await f.balance()).availableAmount, '6.00')
    assert.equal((await f.balance()).adjustmentDebt, '10.00')
    const [note] = (await f.engine.getOrderBenefitNotificationData(
      seed.id,
      f.store.id,
      f.tx
    ))!.grants
    assert.equal(note.earnedAmount, '10.00') // Returned money is never a second gain.
  }
)

postgresTest(
  'refund into suspended reward stays frozen and cannot repay debt until participation repaired',
  async f => {
    await f.configure({ loyaltyEnabled: true, cashbackEnabled: false })
    const first = await f.order()
    const second = await f.order()
    await f.status(first, 'COMPLETED')
    await f.status(second, 'COMPLETED')
    const spend = await f.order({}, false)
    await f.engine.debitOrderBenefitBalance(spend, f.phone, '3.00', f.tx)
    await f.status(first, 'CANCELLED')
    const [account] = await f.tx
      .select()
      .from(schema.benefitAccountsTable)
      .where(eq(schema.benefitAccountsTable.storeId, f.store.id))
    await f.tx
      .update(schema.benefitAccountsTable)
      .set({ adjustmentDebt: '10.00' })
      .where(eq(schema.benefitAccountsTable.id, account.id))
    const cancelled = await f.status(spend, 'REJECTED')
    await f.engine.refundOrderBenefitBalance(cancelled, f.tx)
    assert.equal((await f.balance()).availableAmount, '0.00')
    assert.equal((await f.balance()).adjustmentDebt, '10.00')
    const repair = await f.order()
    await f.status(repair, 'COMPLETED')
    assert.equal((await f.balance()).availableAmount, '5.00')
    assert.equal((await f.balance()).adjustmentDebt, '10.00')
  }
)

postgresTest(
  'expiry is excluded and audited once; expiring spent lots refund for seven days; FIFO by expiry',
  async f => {
    // Insert an explicit already elapsed QA lot; expiry/origin cannot be rewritten.
    const first = await f.order()
    await f.status(first, 'COMPLETED')
    const [account] = await f.tx
      .select()
      .from(schema.benefitAccountsTable)
      .where(eq(schema.benefitAccountsTable.storeId, f.store.id))
    const [expired] = await f.tx
      .insert(schema.benefitLotsTable)
      .values({
        storeId: f.store.id,
        accountId: account.id,
        sourceKey: 'qa-expired',
        originalAmount: '8.00',
        remainingAmount: '3.00',
        spentAmount: '5.00',
        expiresAt: new Date('2020-01-01Z'),
      })
      .returning()
    assert.equal((await f.balance()).availableAmount, '10.00')
    await f.balance()
    const expiryEvents = await f.tx
      .select()
      .from(schema.benefitEventsTable)
      .where(eq(schema.benefitEventsTable.eventKey, `expire:${expired.id}`))
    assert.equal(expiryEvents.length, 1)
    const debit = await f.order({}, false)
    await f.tx.insert(schema.benefitDebitsTable).values({
      orderId: debit.id,
      storeId: f.store.id,
      accountId: account.id,
      amount: '5.00',
    })
    await f.tx.insert(schema.benefitAllocationsTable).values({
      orderId: debit.id,
      storeId: f.store.id,
      accountId: account.id,
      lotId: expired.id,
      amount: '5.00',
    })
    const [beforeClock] = await f.tx.execute(
      sql`select clock_timestamp() as instant`
    )
    const before = new Date(beforeClock.instant as string | Date).getTime()
    // The status transition already refunds. The explicit call below is replay.
    const cancelled = await f.status(debit, 'REJECTED')
    await f.engine.refundOrderBenefitBalance(cancelled, f.tx)
    const restored = await f.tx
      .select()
      .from(schema.benefitLotsTable)
      .where(
        and(
          eq(schema.benefitLotsTable.accountId, account.id),
          sql`${schema.benefitLotsTable.sourceKey} like 'refund:%'`
        )
      )
    assert.equal(restored.length, 1)
    const [afterClock] = await f.tx.execute(
      sql`select clock_timestamp() as instant`
    )
    const after = new Date(afterClock.instant as string | Date).getTime()
    assert(restored[0].expiresAt.getTime() >= before + 7 * 86400000 - 1000)
    assert(restored[0].expiresAt.getTime() <= after + 7 * 86400000 + 1000)
    const spend = await f.order({}, false)
    await f.engine.debitOrderBenefitBalance(spend, f.phone, '2.00', f.tx)
    const [allocation] = await f.tx
      .select()
      .from(schema.benefitAllocationsTable)
      .where(eq(schema.benefitAllocationsTable.orderId, spend.id))
    assert.equal(allocation.lotId, restored[0].id)
  }
)

postgresTest(
  'loyalty reserves N pending slots; pins old rule, waits confirmations and never abandons old progress',
  async f => {
    await f.configure({ loyaltyEnabled: true, cashbackEnabled: false })
    const first = await f.order()
    const second = await f.order()
    await f.configure({
      loyaltyEnabled: true,
      loyaltyRequiredOrders: 3,
      loyaltyRewardAmount: '99.00',
      cashbackEnabled: false,
    })
    const third = await f.order()
    await f.status(second, 'COMPLETED')
    assert.equal((await f.balance()).availableAmount, '0.00')
    await f.status(first, 'CANCELLED')
    const replacement = await f.order()
    const participations = await f.tx
      .select()
      .from(schema.benefitGrantsTable)
      .where(
        and(
          eq(
            schema.benefitGrantsTable.accountId,
            (
              await f.tx
                .select()
                .from(schema.benefitAccountsTable)
                .where(eq(schema.benefitAccountsTable.storeId, f.store.id))
            )[0].id
          ),
          eq(schema.benefitGrantsTable.kind, 'loyalty')
        )
      )
    assert.equal(
      participations.find(p => p.orderId === replacement.id)?.cycleId,
      participations.find(p => p.orderId === second.id)?.cycleId
    )
    assert.notEqual(
      participations.find(p => p.orderId === third.id)?.cycleId,
      participations.find(p => p.orderId === second.id)?.cycleId
    )
    await f.status(replacement, 'COMPLETED')
    await f.status(replacement, 'COMPLETED')
    assert.equal((await f.balance()).availableAmount, '5.00')
  }
)

postgresTest(
  'disabled program or revoked module cannot gain, then re-enable fills the old cycle',
  async f => {
    await f.configure({ loyaltyEnabled: true, cashbackEnabled: false })
    const first = await f.order()
    await f.status(first, 'COMPLETED')
    await f.configure({ loyaltyEnabled: false, cashbackEnabled: false })
    const disabled = await f.order()
    await f.status(disabled, 'COMPLETED')
    assert.equal((await f.balance()).confirmedParticipations, 1)
    await f.configure({
      loyaltyEnabled: true,
      cashbackEnabled: false,
      loyaltyRequiredOrders: 10,
    })
    const second = await f.order()
    await f.status(second, 'COMPLETED')
    assert.equal((await f.balance()).availableAmount, '5.00')
    await f.tx
      .update(schema.storeModuleEntitlementsTable)
      .set({ status: 'inactive' })
      .where(eq(schema.storeModuleEntitlementsTable.storeId, f.store.id))
    const revoked = await f.order()
    await f.status(revoked, 'COMPLETED')
    assert.equal((await f.balance()).confirmedParticipations, 2)
  }
)

postgresTest(
  'consumed loyalty reward is not charged, repair restores only unconsumed remainder before new reward',
  async f => {
    await f.configure({ loyaltyEnabled: true, cashbackEnabled: false })
    const first = await f.order()
    const second = await f.order()
    await f.status(first, 'COMPLETED')
    await f.status(second, 'COMPLETED')
    const debit = await f.order({}, false)
    await f.engine.debitOrderBenefitBalance(debit, f.phone, '3.00', f.tx)
    await f.status(first, 'CANCELLED')
    assert.equal((await f.balance()).adjustmentDebt, '0.00')
    assert.equal((await f.balance()).availableAmount, '0.00')
    const repair = await f.order()
    await f.status(repair, 'COMPLETED')
    assert.equal((await f.balance()).availableAmount, '2.00')
    const rewards = await f.tx
      .select()
      .from(schema.benefitGrantsTable)
      .where(
        and(
          eq(schema.benefitGrantsTable.storeId, f.store.id),
          eq(schema.benefitGrantsTable.kind, 'reward')
        )
      )
    assert.equal(rewards.length, 1)
    const third = await f.order()
    const fourth = await f.order()
    await f.status(third, 'COMPLETED')
    await f.status(fourth, 'COMPLETED')
    assert.equal((await f.balance()).availableAmount, '7.00')
  }
)

postgresTest(
  'product right retains historical identity after catalog deletion; no unavailable reward notification',
  async f => {
    const [product] = await f.tx
      .insert(schema.itemsTable)
      .values({ storeId: f.store.id, name: 'Historical product' })
      .returning()
    await f.configure({
      loyaltyEnabled: true,
      cashbackEnabled: false,
      loyaltyRequiredOrders: 1,
      loyaltyRewardType: 'product',
      loyaltyRewardAmount: null,
      loyaltyRewardItemId: product.id,
    })
    const first = await f.order()
    await f.tx
      .delete(schema.itemsTable)
      .where(eq(schema.itemsTable.id, product.id))
    await f.status(first, 'COMPLETED')
    const [right] = await f.tx
      .select()
      .from(schema.benefitGrantsTable)
      .where(
        and(
          eq(schema.benefitGrantsTable.orderId, first.id),
          eq(schema.benefitGrantsTable.kind, 'reward')
        )
      )
    assert.equal(right.rewardItemId, product.id)
    assert.equal(right.rewardItemName, 'Historical product')
    assert.equal(right.state, 'confirmed')
    assert.equal((await f.balance()).availableAmount, '0.00')
    const notification = await f.engine.getOrderBenefitNotificationData(
      first.id,
      f.store.id,
      f.tx
    )
    assert(!notification?.grants.some(g => g.grantId === right.id))
  }
)

postgresTest(
  'database rejects history rewrites, cross-store lots and invalid projections; no Data API privileges',
  async f => {
    const first = await f.order()
    await f.status(first, 'COMPLETED')
    const fails = async (query: Parameters<DbTransaction['execute']>[0]) => {
      await f.tx.execute(sql`savepoint kan152_negative`)
      await assert.rejects(f.tx.execute(query))
      await f.tx.execute(sql`rollback to savepoint kan152_negative`)
    }
    for (const table of [
      'benefit_events',
      'benefit_captures',
      'benefit_allocations',
      'benefit_cycles',
      'benefit_debits',
    ]) {
      // TRUNCATE checks statement-level protection even when a table has no rows.
      await fails(sql.raw(`TRUNCATE public.${table} CASCADE`))
    }
    await fails(
      sql`update public.benefit_events set type = 'tampered' where store_id = ${f.store.id}`
    )
    await fails(
      sql`delete from public.benefit_captures where store_id = ${f.store.id}`
    )
    await fails(
      sql`update public.benefit_lots set remaining_amount = -1 where store_id = ${f.store.id}`
    )
    await fails(
      sql`update public.benefit_lots set expires_at = now() where store_id = ${f.store.id}`
    )
    const [account] = await f.tx
      .select()
      .from(schema.benefitAccountsTable)
      .where(eq(schema.benefitAccountsTable.storeId, f.store.id))
    await fails(sql`insert into public.benefit_lots(store_id,account_id,source_key,original_amount,remaining_amount,expires_at)
    values (${f.other.id},${account.id},'foreign',1,1,now() + interval '1 day')`)
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const table of tables) {
        const result = await f.tx.execute(
          sql`select has_table_privilege(${role}, ${`public.${getTableConfig(table).name}`}, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as allowed`
        )
        assert.equal(result[0].allowed, false)
      }
    }
  }
)
