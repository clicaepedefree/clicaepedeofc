import { describe, test } from 'bun:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import * as schema from '@/services/db/schema'
import type { DbTransaction } from '@/services/db/types'
import { ProductRewardError } from './product-rewards-policy'

const { mock } = require('bun:test') as {
  mock: { module(name: string, factory: () => unknown): void }
}
mock.module('server-only', () => ({}))
// Never construct a database connection or read a production URL in unit tests.
mock.module('@/services/db', () => ({ db: {} }))
const engine = await import('./product-rewards')
const ledger = await import('./ledger')

const {
  benefitAccountsTable: accounts,
  benefitGrantsTable: grants,
  benefitProductRedemptionsTable: redemptions,
  ordersTable: orders,
  benefitCapturesTable: captures,
  benefitEventsTable: events,
  benefitLotsTable: lots,
  benefitDebitsTable: debits,
  benefitCyclesTable: cycles,
  storeBenefitProgramVersionsTable: versions,
  itemsTable: items,
  itemOfferingsTable: offerings,
} = schema
const at = new Date('2026-11-03T12:00:00Z')
const expiresAt = new Date('2026-11-10T12:00:00Z')
const rewardId = '00000000-0000-4000-8000-000000000001'
const account = {
  id: 'account',
  storeId: 71,
  phone: '5511987654321',
  adjustmentDebt: '0.00',
}
const order = {
  id: 123,
  storeId: 71,
  customerPhone: account.phone,
  salesChannel: 'DIGITAL_MENU',
  type: 'TAKEOUT',
  status: 'PENDING',
  totalPrice: '0.00',
  deliveryFee: '0.00',
} as schema.SelectOrder
const grant = {
  id: rewardId,
  accountId: account.id,
  storeId: 71,
  kind: 'reward',
  state: 'confirmed',
  confirmedAt: at,
  expiresAt,
  rewardItemId: 300,
  rewardItemName: 'Produto original',
  cycleId: 'cycle',
  amount: '0.00',
}
const used = {
  id: 'redemption',
  grantId: rewardId,
  accountId: account.id,
  storeId: 71,
  orderId: order.id,
  itemId: 300,
  itemName: grant.rewardItemName,
  originalExpiresAt: expiresAt,
  state: 'reserved',
  createdAt: at,
  completedAt: null,
  refundedAt: null,
}
const input = {
  storeId: order.storeId,
  phone: account.phone,
  orderId: order.id,
  rewardId,
}
type Step = [unknown, unknown[]]

// A scripted transaction double, not a SQL/concurrency emulator. Real Drizzle
// expressions are compiled so tests can verify account/store scoping and locks.
function transaction(plan: Step[], instant = at) {
  const remaining = [...plan]
  const writes: {
    table: unknown
    data: Record<string, unknown>
    type: string
  }[] = []
  const calls: {
    name: string
    table?: unknown
    sql?: string
    params?: unknown[]
  }[] = []
  const dialect = new PgDialect()
  const tx = {
    execute: async (query: SQL) => {
      const compiled = dialect.sqlToQuery(query)
      calls.push({ name: 'execute', ...compiled })
      return compiled.sql.includes('clock_timestamp') ? [{ instant }] : []
    },
    select: () => ({
      from: (table: unknown) => {
        const step = remaining.shift()
        assert(
          step,
          `Unexpected select from ${getTableConfig(table as typeof accounts).name}`
        )
        assert.equal(table, step[0], 'transaction query order')
        const result = {
          where: (query: SQL) => {
            calls.push({ name: 'where', table, ...dialect.sqlToQuery(query) })
            return result
          },
          orderBy: () => result,
          innerJoin: () => result,
          limit: () => result,
          for: (mode: string) => {
            calls.push({ name: `lock:${mode}`, table })
            return result
          },
          then: (resolve: (rows: unknown[]) => unknown) =>
            Promise.resolve(step[1]).then(resolve),
        }
        return result
      },
    }),
    insert: (table: unknown) => ({
      values: (data: Record<string, unknown>) => {
        writes.push({ type: 'insert', table, data })
        const result = {
          onConflictDoNothing: () => result,
          returning: async () => [
            {
              id: table === redemptions ? 'redemption' : 'generated',
              ...data,
              state: data.state ?? 'reserved',
              completedAt: null,
              refundedAt: null,
            },
          ],
          then: (resolve: (rows: unknown[]) => unknown) =>
            Promise.resolve([]).then(resolve),
        }
        return result
      },
    }),
    update: (table: unknown) => ({
      set: (data: Record<string, unknown>) => ({
        where: async () => {
          writes.push({ type: 'update', table, data })
        },
      }),
    }),
  } as unknown as DbTransaction
  return {
    tx,
    writes,
    calls,
    done: () =>
      assert.equal(remaining.length, 0, 'all scripted reads consumed'),
  }
}

function reservePlan(patch: Record<string, unknown> = {}): Step[] {
  return [
    [orders, [order]],
    [accounts, [account]],
    [redemptions, []],
    [captures, []],
    [grants, [{ ...grant, ...patch }]],
    [redemptions, []],
    [items, [{ id: 300, inventory: 1 }]],
    [offerings, [{ itemId: 300, id: 400 }]],
  ]
}

describe('product reward transaction primitives', () => {
  test('reserves one zero-price item with stable voucher using order -> account locks and scoped queries', async () => {
    const f = transaction(reservePlan())
    const result = await engine.reserveProductRewardForOrder(input, f.tx)
    assert.deepEqual(result, {
      rewardId,
      grantId: rewardId,
      redemptionId: 'redemption',
      voucherCode: `FID-${rewardId}`,
      itemId: 300,
      itemName: grant.rewardItemName,
      quantity: 1,
      unitPrice: '0.00',
      expiresAt,
    })
    assert.equal(f.writes.filter(w => w.table === redemptions).length, 1)
    assert.equal(f.writes.filter(w => w.table === events).length, 1)
    const lockOrder = f.calls.findIndex(
      c => c.name === 'lock:update' && c.table === orders
    )
    const lockAccount = f.calls.findIndex(
      c => c.name === 'execute' && c.sql?.includes('pg_advisory_xact_lock')
    )
    assert(lockOrder < lockAccount)
    assert.deepEqual(f.calls[lockAccount].params, [
      `benefits:${order.storeId}:${account.phone}`,
    ])
    const grantQuery = f.calls.find(c => c.table === grants)!
    assert(grantQuery.params?.includes(account.id))
    assert(grantQuery.params?.includes(order.storeId))
    const catalogQuery = f.calls.find(c => c.table === offerings)!
    assert(catalogQuery.sql?.includes('og.min_quantity <> 0'))
    assert(catalogQuery.sql?.includes('og.store_id <>'))
    assert(catalogQuery.sql?.includes('is_available'))
    f.done()
  })

  test('same order/reward replay returns original allocation even after expiry, with no writes', async () => {
    const f = transaction(
      [
        [orders, [order]],
        [accounts, [account]],
        [redemptions, [used]],
      ],
      new Date('2027-01-01')
    )
    assert.equal(
      (await engine.reserveProductRewardForOrder(input, f.tx)).redemptionId,
      used.id
    )
    assert.equal(f.writes.length, 0)
    f.done()
  })

  test('invalid phone, voucher or order identity fail with sanitized domain error', async () => {
    for (const patch of [
      { phone: '123' },
      { rewardId: 'FID-public-not-authorization' },
      { orderId: -1 },
    ]) {
      const f = transaction([])
      await assert.rejects(
        engine.reserveProductRewardForOrder({ ...input, ...patch }, f.tx),
        ProductRewardError
      )
      assert.equal(f.writes.length, 0)
    }
    for (const changed of [
      { ...order, customerPhone: '5521987654321' },
      { ...order, status: 'CANCELLED' },
      { ...order, salesChannel: 'POS' },
    ]) {
      const f = transaction([[orders, [changed]]])
      await assert.rejects(
        engine.reserveProductRewardForOrder(input, f.tx),
        ProductRewardError
      )
      assert.equal(f.writes.length, 0)
      f.done()
    }
    const f = transaction([[orders, []]])
    await assert.rejects(
      engine.reserveProductRewardForOrder(input, f.tx),
      ProductRewardError
    )
    f.done()
  })

  test('another account/reward, refunded order replay and another order active use cannot consume twice', async () => {
    for (const patch of [
      { accountId: 'other' },
      { grantId: 'other' },
      { state: 'refunded' },
    ]) {
      const f = transaction([
        [orders, [order]],
        [accounts, [account]],
        [redemptions, [{ ...used, ...patch }]],
      ])
      await assert.rejects(
        engine.reserveProductRewardForOrder(input, f.tx),
        ProductRewardError
      )
      assert.equal(f.writes.length, 0)
      f.done()
    }
    const plan = reservePlan().slice(0, 6)
    plan[5] = [redemptions, [used]]
    const f = transaction(plan)
    await assert.rejects(
      engine.reserveProductRewardForOrder(input, f.tx),
      ProductRewardError
    )
    assert.equal(f.writes.length, 0)
    f.done()
  })

  test('pending, suspended, reversed, expired, foreign or missing grants never reserve', async () => {
    for (const patch of [
      { state: 'pending' },
      { state: 'reversed' },
      { expiresAt: at },
      { confirmedAt: null },
    ]) {
      const f = transaction(reservePlan(patch).slice(0, 5))
      await assert.rejects(
        engine.reserveProductRewardForOrder(input, f.tx),
        ProductRewardError
      )
      assert.equal(f.writes.length, 0)
      f.done()
    }
    const plan = reservePlan().slice(0, 5)
    plan[4] = [grants, []] // Composite predicate hides foreign grants as missing.
    const f = transaction(plan)
    await assert.rejects(
      engine.reserveProductRewardForOrder(input, f.tx),
      ProductRewardError
    )
    assert.equal(f.writes.length, 0)
    f.done()
  })

  test('deleted, unavailable, required-options-only and out-of-stock catalog cannot consume the right', async () => {
    for (const [products, plain] of [
      [[], []],
      [[{ id: 300, inventory: 0 }], [{ itemId: 300, id: 400 }]],
      [[{ id: 300, inventory: 1 }], []],
    ] as [unknown[], unknown[]][]) {
      const plan = reservePlan()
      plan[6] = [items, products]
      plan[7] = [offerings, plain]
      const f = transaction(plan)
      await assert.rejects(
        engine.reserveProductRewardForOrder(input, f.tx),
        ProductRewardError
      )
      assert.equal(f.writes.length, 0)
      f.done()
    }
  })

  test('must reserve before immutable earnings capture and cannot reserve a new completed order', async () => {
    const f = transaction([
      [orders, [order]],
      [accounts, [account]],
      [redemptions, []],
      [captures, [{ orderId: order.id }]],
    ])
    await assert.rejects(
      engine.reserveProductRewardForOrder(input, f.tx),
      ProductRewardError
    )
    assert.equal(f.writes.length, 0)
    f.done()
    const completed = transaction([
      [orders, [{ ...order, status: 'COMPLETED' }]],
      [accounts, [account]],
      [redemptions, []],
    ])
    await assert.rejects(
      engine.reserveProductRewardForOrder(input, completed.tx),
      ProductRewardError
    )
    assert.equal(completed.writes.length, 0)
    completed.done()
  })

  test('completion records consumption only on COMPLETED and replays do not write', async () => {
    const pending = transaction([[orders, [order]]])
    await engine.completeProductRewardForOrder(order, pending.tx)
    assert.equal(pending.writes.length, 0)
    pending.done()
    for (const state of ['reserved', 'completed', 'refunded']) {
      const f = transaction([
        [orders, [{ ...order, status: 'COMPLETED' }]],
        [redemptions, [used]],
        [accounts, [account]],
        [accounts, [account]],
        [redemptions, [{ ...used, state }]],
      ])
      await engine.completeProductRewardForOrder(order, f.tx)
      assert.equal(f.writes.length, state === 'reserved' ? 2 : 0)
      if (state === 'reserved')
        assert.deepEqual(f.writes[0].data, {
          state: 'completed',
          completedAt: at,
        })
      f.done()
    }
  })

  test('cancel/refund uses reservation identity, original expiry, no money and no new grant after expiry', async () => {
    for (const state of ['reserved', 'completed', 'refunded']) {
      const late = new Date('2027-01-01T12:00:00Z')
      const changed = {
        ...order,
        status: 'CANCELLED',
        customerPhone: '5521987654321',
      }
      const f = transaction(
        [
          [orders, [changed]],
          [redemptions, [used]],
          [accounts, [account]],
          [accounts, [account]],
          [redemptions, [{ ...used, state }]],
        ],
        late
      )
      await engine.refundProductRewardForOrder(order, f.tx)
      assert.equal(f.writes.length, state === 'refunded' ? 0 : 2)
      if (state !== 'refunded') {
        assert.deepEqual(f.writes[0].data, {
          state: 'refunded',
          refundedAt: late,
        })
        const audit = f.writes.find(w => w.table === events)!
        assert.equal(
          (audit.data.metadata as { originalExpiresAt: string })
            .originalExpiresAt,
          expiresAt.toISOString()
        )
        assert(
          !f.writes.some(
            w => w.table === grants || w.table === lots || w.table === accounts
          )
        )
      }
      f.done()
    }
  })

  test('list retains expired/deleted/suspended/consumed histories and original name after catalog rename', async () => {
    const expired = {
      ...grant,
      id: 'expired',
      expiresAt: at,
      rewardItemId: 301,
    }
    const suspended = {
      ...grant,
      id: 'suspended',
      state: 'pending',
      rewardItemId: 302,
    }
    const consumed = { ...grant, id: 'consumed' }
    const f = transaction([
      [accounts, [account]],
      [grants, [grant, expired, suspended, consumed]],
      [
        redemptions,
        [
          { ...used, state: 'refunded' },
          {
            ...used,
            id: 'consumed-use',
            grantId: 'consumed',
            state: 'completed',
          },
        ],
      ],
      [
        items,
        [
          { id: 300, name: 'Renomeado', inventory: 1 },
          { id: 302, inventory: 0 },
        ],
      ],
      [offerings, [{ itemId: 300, id: 400 }]],
    ])
    const result = await engine.listAvailableProductRewards(
      71,
      account.phone,
      f.tx
    )
    assert.deepEqual(
      result.map(r => [r.state, r.availability, r.canReserve]),
      [
        ['available', 'available', true],
        ['expired', 'deleted', false],
        ['suspended', 'out_of_stock', false],
        ['consumed', 'available', false],
      ]
    )
    assert.equal(result[0].itemName, 'Produto original')
    assert.equal(result[0].voucherCode, `FID-${rewardId}`)
    assert.equal(result[0].history[0].state, 'refunded')
    assert.equal(result[1].expiresAt, at)
    assert.equal(f.writes.length, 0)
    f.done()
  })

  test('settleOrderBenefits automatically consumes/refunds even without an earning capture', async () => {
    for (const status of ['COMPLETED', 'CANCELLED'] as const) {
      const stored = { ...order, status }
      const plan: Step[] = [
        [orders, [stored]],
        [orders, [stored]],
        [redemptions, [used]],
        [accounts, [account]],
        [accounts, [account]],
        [redemptions, [used]],
        [captures, []],
      ]
      if (status === 'CANCELLED')
        plan.push([orders, [stored]], [schema.benefitAllocationsTable, []])
      const f = transaction(plan)
      await ledger.settleOrderBenefits(stored, f.tx)
      assert.equal(
        f.writes[0].data.state,
        status === 'COMPLETED' ? 'completed' : 'refunded'
      )
      f.done()
    }
  })

  test('product grant is issued only when all cycle participations are confirmed on COMPLETED, never with a pending slot', async () => {
    const pending = transaction([[orders, [order]]])
    await ledger.settleOrderBenefits(order, pending.tx)
    assert.equal(pending.writes.length, 0)
    pending.done()
    const rule = {
      version: 1,
      loyaltyRequiredOrders: 2,
      loyaltyRewardExpiresAfterDays: 7,
      loyaltyRewardType: 'product',
      loyaltyRewardItemId: 300,
      loyaltyRewardItemName: 'Produto original',
    }
    for (const confirmed of [false, true]) {
      const stored = { ...order, status: 'COMPLETED' as const }
      const participation = {
        id: 'participation',
        kind: 'loyalty',
        state: 'pending',
        cycleId: 'cycle',
        validityDays: 7,
        amount: '0.00',
      }
      const f = transaction([
        [orders, [stored]],
        [orders, [stored]],
        [redemptions, []],
        [captures, [{ accountId: account.id }]],
        [accounts, [account]],
        [accounts, [account]],
        [lots, []],
        [grants, [participation]],
        [cycles, [{ id: 'cycle', ruleVersion: 1 }]],
        [versions, [rule]],
        [
          grants,
          [
            { state: 'confirmed' },
            { state: confirmed ? 'confirmed' : 'pending' },
          ],
        ],
        [grants, []],
      ])
      await ledger.settleOrderBenefits(stored, f.tx)
      const issued = f.writes.filter(
        w => w.table === grants && w.type === 'insert'
      )
      assert.equal(issued.length, confirmed ? 1 : 0)
      if (confirmed) {
        assert.equal(issued[0].data.rewardItemId, rule.loyaltyRewardItemId)
        assert.equal(issued[0].data.state, 'confirmed')
        assert.equal(issued[0].data.amount, '0.00')
        assert.equal(
          (issued[0].data.expiresAt as Date).getTime(),
          at.getTime() + 7 * 86400000
        )
        assert.equal(
          (issued[0].data.confirmedAt as Date).getTime(),
          at.getTime()
        )
      }
      f.done()
    }
  })

  test('N=1/minimum=0 reward-only order cannot create another participation; paid products still participate', async () => {
    const rule = {
      version: 1,
      loyaltyEnabled: true,
      loyaltyRequiredOrders: 1,
      loyaltyMinimumOrderAmount: '0.00',
      loyaltyRewardExpiresAfterDays: 7,
      loyaltyRewardType: 'product',
      loyaltyRewardItemId: 300,
      cashbackEnabled: false,
    }
    for (const paid of ['0.00', '10.00']) {
      const stored = {
        ...order,
        totalPrice: paid,
        snapshot: { productReward: { rewardId } },
      }
      const plan: Step[] = [
        [orders, [stored]],
        [captures, []],
        [schema.storeSubscriptionsTable, []],
        [
          schema.storeModuleEntitlementsTable,
          [
            {
              code: 'loyalty',
              origin: 'courtesy',
              status: 'active',
              isAdditional: false,
            },
          ],
        ],
        [versions, [rule]],
        [accounts, [account]],
        [debits, []],
      ]
      if (paid === '0.00') plan.push([redemptions, [used]])
      else plan.push([cycles, []])
      const f = transaction(plan)
      await ledger.captureOrderBenefits(stored as schema.SelectOrder, f.tx)
      const capture = f.writes.find(w => w.table === captures)!
      assert.equal(capture.data.baseAmount, paid)
      assert.equal(capture.data.loyaltyEnabled, paid !== '0.00')
      assert.equal(
        f.writes.filter(w => w.table === grants).length,
        paid === '0.00' ? 0 : 1
      )
      assert.equal(
        f.writes.filter(w => w.table === cycles).length,
        paid === '0.00' ? 0 : 1
      )
      assert(!f.writes.some(w => w.table === lots))
      f.done()
    }
  })

  test('cancelled origin of an already-issued product blocks the next reward until missing participation is repaired, never charging money', async () => {
    const rule = {
      version: 1,
      loyaltyRequiredOrders: 1,
      loyaltyRewardExpiresAfterDays: 7,
      loyaltyRewardType: 'product',
      loyaltyRewardItemId: 300,
      loyaltyRewardItemName: 'Produto original',
    }
    const oldCycle = { id: 'old', ruleVersion: 1 }
    const nextCycle = { id: 'next', ruleVersion: 1 }
    for (const repaired of [false, true]) {
      const stored = { ...order, status: 'COMPLETED' as const }
      const plan: Step[] = [
        [orders, [stored]],
        [orders, [stored]],
        [redemptions, []],
        [captures, [{ accountId: account.id }]],
        [accounts, [account]],
        [accounts, [account]],
        [lots, []],
        [grants, []],
        [cycles, [oldCycle, nextCycle]],
        [versions, [rule]],
        [grants, repaired ? [{ state: 'confirmed' }] : []],
        [
          grants,
          [
            {
              ...grant,
              cycleId: oldCycle.id,
              state: repaired ? 'pending' : 'confirmed',
            },
          ],
        ],
        [versions, [rule]],
        [grants, [{ state: 'confirmed' }]],
        [grants, []],
      ]
      const f = transaction(plan)
      await ledger.settleOrderBenefits(stored, f.tx)
      const issued = f.writes.filter(
        w => w.type === 'insert' && w.table === grants
      )
      assert.equal(issued.length, repaired ? 1 : 0)
      assert.equal(
        f.writes.find(w => w.type === 'update' && w.table === grants)?.data
          .state,
        repaired ? 'confirmed' : 'pending'
      )
      assert(
        !f.writes.some(
          w => w.table === accounts || (w.table === lots && w.type === 'insert')
        )
      )
      assert(!f.writes.some(w => w.table === redemptions)) // Consumed prize never reclaimed.
      if (repaired) assert.equal(issued[0].data.amount, '0.00')
      f.done()
    }
  })

  test('native product notification uses original name and stable voucher; deleted/unavailable/expired products are not announced', async () => {
    for (const mode of ['renamed', 'deleted', 'unavailable', 'expired']) {
      const stored = { ...order, status: 'COMPLETED' as const }
      const earned = {
        ...grant,
        expiresAt: mode === 'expired' ? at : expiresAt,
      }
      const plan: Step[] = [
        [orders, [stored]],
        [captures, [{ accountId: account.id }]],
        [accounts, [account]],
        [accounts, [account]],
        [lots, []],
        [lots, []],
        [grants, []],
        [grants, []],
        [grants, [earned]],
      ]
      if (mode !== 'expired')
        plan.push(
          [
            items,
            mode === 'deleted'
              ? []
              : [{ id: 300, name: 'Renomeado', inventory: 1 }],
          ],
          [offerings, mode === 'renamed' ? [{ itemId: 300, id: 400 }] : []]
        )
      const f = transaction(plan)
      const notification = await ledger.getOrderBenefitNotificationData(
        order.id,
        order.storeId,
        f.tx
      )
      assert.deepEqual(
        notification,
        mode === 'renamed'
          ? {
              customerPhone: account.phone,
              grants: [
                {
                  type: 'product_reward',
                  grantId: rewardId,
                  productName: grant.rewardItemName,
                  voucherCode: `FID-${rewardId}`,
                  expiresAt: expiresAt.toISOString(),
                },
              ],
            }
          : null
      )
      assert.equal(f.writes.length, 0)
      f.done()
    }
  })
})

describe('product reward persistence contract', () => {
  test('migration is additive, scoped, one active right, private and history preserving', () => {
    const migration = readFileSync(
      new URL(
        '../../../supabase/migrations/20261103164336_kan158_product_reward_redemptions.sql',
        import.meta.url
      ),
      'utf8'
    )
    const config = getTableConfig(redemptions)
    assert(migration.includes(`CREATE TABLE public.${config.name}`))
    assert.equal(config.foreignKeys.length, 2)
    assert(
      config.foreignKeys.some(
        fk =>
          fk
            .reference()
            .columns.map(c => c.name)
            .join(',') === 'grant_id,account_id,store_id'
      )
    )
    assert(
      config.indexes.some(
        i => i.config.name === 'benefit_product_redemption_active'
      )
    )
    assert(migration.includes("WHERE state <> 'refunded'"))
    assert(migration.includes('UNIQUE (order_id)'))
    assert(migration.includes('ENABLE ROW LEVEL SECURITY'))
    assert(migration.includes('FORCE ROW LEVEL SECURITY'))
    assert(migration.includes('FROM PUBLIC, anon, authenticated, service_role'))
    assert(migration.includes('SECURITY INVOKER SET search_path'))
    assert(migration.includes('BEFORE INSERT OR UPDATE OR DELETE'))
    assert(migration.includes('BEFORE TRUNCATE'))
    assert(!migration.includes('SECURITY DEFINER'))
    assert(!migration.includes('REFERENCES public.items'))
    assert(
      !/DROP |ALTER TABLE public\.benefit_(grants|cycles|events)/.test(
        migration
      )
    )
    assert(migration.includes('g.expires_at = NEW.original_expires_at'))
    assert(migration.includes("g.state = 'confirmed'"))
  })
})
