import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { PgDialect } from 'drizzle-orm/pg-core'
import { ordersTable } from '@/services/db/schema/orders'
import { orderPaymentsTable } from '@/services/db/schema/order-payments'
import { manualRefundsTable } from '@/services/db/schema/manual-refunds'
import { publicOrderSubmissionsTable } from '@/services/db/schema/public-order-submissions'
import { publicOrderEventsTable } from '@/services/db/schema/public-order-events'
const { mock } = require('bun:test') as {
  mock: { module(name: string, factory: () => unknown): void }
}

let audit: any[] = []
let settlements = 0
let failBenefits = false
let activeTx: any
let notifications: any[] = []
mock.module('./db', () => ({
  createOrderAuditEventOnDb: async (input: any) => {
    assert.equal(input.dbSession, activeTx)
    audit.push(input.event)
  },
  enqueueOrderStatusWhatsappNotificationOnDb: async (input: any) => {
    assert.equal(input.dbSession, activeTx)
    notifications.push(input)
  },
}))
mock.module('@/features/benefit-programs/ledger', () => ({
  settleOrderBenefits: async (order: any, tx: any) => {
    assert.equal(tx, activeTx)
    assert.equal(order.status, 'CANCELLED')
    settlements++
    if (failBenefits) throw new Error('BENEFIT_FAILURE')
  },
}))
const { cancelCompletedOrderOnDb, confirmManualRefundReviewOnDb } =
  await import('./completed-cancellation')

function fixture(
  payments: any[] = [
    {
      id: 4,
      orderId: 1,
      type: 'PENDING',
      method: 'CASH',
      value: '20.0000',
      changeFor: '50',
    },
  ]
) {
  audit = []
  settlements = 0
  failBenefits = false
  notifications = []
  let state: any = {
    order: {
      id: 1,
      storeId: 9,
      status: 'COMPLETED',
      displayId: '1',
      totalPrice: '20',
      salesChannel: 'DIGITAL_MENU',
      completedAt: new Date(0),
      posCounterId: 7,
    },
    record: null,
    payments,
    publicStatus: 'COMPLETED',
    publicEvents: [],
  }
  const dialect = new PgDialect()
  const params = (where: any) => dialect.sqlToQuery(where).params
  const tx: any = {
    select: () => ({
      from: (table: any) => ({
        where: (where: any) => {
          const values = params(where)
          if (table === ordersTable) {
            const rows =
              values[0] === state.order.id && values[1] === state.order.storeId
                ? [state.order]
                : []
            return {
              limit: () => ({
                for: (mode: string) => {
                  assert.equal(mode, 'update')
                  return Promise.resolve(rows)
                },
              }),
            }
          }
          if (table === manualRefundsTable) {
            assert.deepEqual(values, [1, 9])
            return { limit: async () => (state.record ? [state.record] : []) }
          }
          assert.equal(table, orderPaymentsTable)
          assert.deepEqual(values, [1])
          return { orderBy: async () => state.payments }
        },
      }),
    }),
    insert: (table: any) => ({
      values: (value: any) => {
        if (table === manualRefundsTable) {
          state.record = {
            id: 1,
            ...value,
            confirmationKey: null,
            confirmationReason: null,
            confirmedByUserId: null,
            confirmedAt: null,
            createdAt: new Date(),
          }
          return { returning: async () => [state.record] }
        }
        assert.equal(table, publicOrderEventsTable)
        state.publicEvents.push(value)
        return Promise.resolve()
      },
    }),
    update: (table: any) => ({
      set: (value: any) => ({
        where: (where: any) => {
          assert.deepEqual(params(where), [1, 9])
          if (table === ordersTable) {
            Object.assign(state.order, value)
            return { returning: async () => [state.order] }
          }
          if (table === manualRefundsTable) {
            Object.assign(state.record, value)
            return { returning: async () => [state.record] }
          }
          assert.equal(table, publicOrderSubmissionsTable)
          state.publicStatus = value.status
          return { returning: async () => [{ id: 'submission' }] }
        },
      }),
    }),
  }
  activeTx = tx
  return {
    state: () => state,
    run: async (fn: (input: any) => Promise<any>, changes = {}) => {
      const before = structuredClone(state),
        oldAudit = [...audit],
        oldSettlements = settlements
      try {
        return await fn({
          orderId: 1,
          storeId: 9,
          reason: 'Erro operacional',
          idempotencyKey: '60a20d59-0000-4000-8000-000000000001',
          actorUserId: 'owner',
          dbSession: tx,
          ...changes,
        })
      } catch (error) {
        state = before
        audit = oldAudit
        settlements = oldSettlements
        throw error
      }
    },
  }
}

test('cancels, settles and audits atomically; preserves payments, original cash and completed timestamp', async () => {
  const f = fixture(),
    original = structuredClone(f.state())
  const result = await f.run(cancelCompletedOrderOnDb)
  assert.equal(result.reviewStatus, 'manual_review_pending')
  assert.equal(result.pendingNotReceivedAmount, '20.0000')
  assert.equal(result.prepaidRecordedAmount, '0.0000')
  assert.equal(result.cashRefundExecuted, false)
  assert.equal(result.stockRestocked, false)
  assert.equal(result.receiptVerified, false)
  assert.deepEqual(f.state().payments, original.payments)
  assert.equal(f.state().order.posCounterId, original.order.posCounterId)
  assert.equal(+f.state().order.completedAt, +original.order.completedAt)
  assert.equal(f.state().publicStatus, 'CANCELLED')
  assert.deepEqual(f.state().publicEvents[0].payload, {})
  assert.equal(settlements, 1)
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].reason, null)
  assert.equal(notifications[0].fromStatus, 'COMPLETED')
  assert.equal(notifications[0].toStatus, 'CANCELLED')
  assert.equal(audit.length, 1)
  assert.equal(notifications.length, 1)
  assert.equal(audit[0].fromStatus, 'COMPLETED')
  assert.equal(audit[0].toStatus, 'CANCELLED')
  assert.equal((await f.run(cancelCompletedOrderOnDb)).replayed, true)
  assert.equal(settlements, 1)
  assert.equal(audit.length, 1)
  for (const changes of [
    { reason: 'Outro motivo' },
    { actorUserId: 'other' },
    { idempotencyKey: '60a20d59-0000-4000-8000-000000000002' },
  ]) {
    await assert.rejects(
      () => f.run(cancelCompletedOrderOnDb, changes),
      /COMMAND_CONFLICT/
    )
  }
})

test('benefit failure rolls back cancellation, review and audit in caller transaction', async () => {
  const f = fixture(),
    original = structuredClone(f.state())
  failBenefits = true
  await assert.rejects(() => f.run(cancelCompletedOrderOnDb), /BENEFIT_FAILURE/)
  assert.deepEqual(f.state(), original)
  assert.equal(audit.length, 0)
  assert.equal(notifications.length, 0)
  failBenefits = false
  assert.equal((await f.run(cancelCompletedOrderOnDb)).replayed, false)
})

test('wrong store or noncompleted order cannot cancel or create review', async () => {
  const f = fixture()
  await assert.rejects(
    () => f.run(cancelCompletedOrderOnDb, { storeId: 10 }),
    /ORDER_NOT_FOUND/
  )
  f.state().order.status = 'READY'
  await assert.rejects(
    () => f.run(cancelCompletedOrderOnDb),
    /REQUIRES_COMPLETED/
  )
  assert.equal(f.state().record, null)
  assert.equal(audit.length, 0)
})

test('documentary confirmation requires review; retry is idempotent and cannot imply money movement', async () => {
  const f = fixture()
  await assert.rejects(
    () => f.run(confirmManualRefundReviewOnDb),
    /REQUIRES_CANCELLED/
  )
  await f.run(cancelCompletedOrderOnDb)
  const originalPayments = structuredClone(f.state().payments)
  const changes = {
    reason: 'Conferencia financeira documentada',
    idempotencyKey: '60a20d59-0000-4000-8000-000000000003',
  }
  const result = await f.run(confirmManualRefundReviewOnDb, changes)
  assert.equal(result.reviewStatus, 'documented')
  assert.equal(result.manualFinancialReconciliationRequired, true)
  assert.equal(result.cashRefundExecuted, false)
  assert.equal(result.receiptVerified, false)
  assert.equal(
    (await f.run(confirmManualRefundReviewOnDb, changes)).replayed,
    true
  )
  await assert.rejects(
    () =>
      f.run(confirmManualRefundReviewOnDb, { ...changes, reason: 'Alteracao' }),
    /COMMAND_CONFLICT/
  )
  assert.equal(audit.length, 2)
  assert.equal(settlements, 1)
  assert.deepEqual(f.state().payments, originalPayments)
})

test('no payment rows: benefits still adjusted, no financial review to confirm', async () => {
  const f = fixture([])
  assert.equal(
    (await f.run(cancelCompletedOrderOnDb)).reviewStatus,
    'not_required'
  )
  assert.equal(settlements, 1)
  await assert.rejects(
    () => f.run(confirmManualRefundReviewOnDb),
    /REVIEW_NOT_REQUIRED/
  )
})
