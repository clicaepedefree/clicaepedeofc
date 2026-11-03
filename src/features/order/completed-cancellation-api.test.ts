import { test } from 'bun:test'
import assert from 'node:assert/strict'
import { PgDialect } from 'drizzle-orm/pg-core'
import {
  roleHasStorePermission,
  type StoreUserRole,
} from '@/features/store-users/store-users-policy'
const { mock } = require('bun:test') as {
  mock: { module(name: string, factory: () => unknown): void }
}

let role: StoreUserRole = 'owner'
let blocked = false
let transactions = 0
let backendCalls: any[] = []
let requestedPermissions: any[] = []
let records: any[] = []
let queryParams: unknown[] = []
let rows: any[] = []
let backendFailure = false
let receiptInput: any
let receiptOrder: any
const tx = {
  select: () => ({
    from: () => ({
      where: (where: any) => {
        queryParams = new PgDialect().sqlToQuery(where).params
        return { limit: async () => records }
      },
    }),
  }),
}
mock.module('@/features/store/api', () => ({
  validateUserPermissionsForStore: async (storeId: number, permission: any) => {
    requestedPermissions.push({ storeId, permission })
    if (blocked || storeId !== 9 || !roleHasStorePermission(role, permission))
      throw new Error('FORBIDDEN')
    return { user: { id: 'trusted-actor' }, storePermissions: { role } }
  },
}))
mock.module('@/services/db', () => ({
  db: {
    transaction: async (fn: any) => {
      transactions++
      return fn(tx)
    },
    query: { ordersTable: { findMany: async () => rows, findFirst: async () => receiptOrder } },
    select: () => {
      const chain: any = {
        from: () => chain, innerJoin: () => chain, where: () => chain,
        limit: async () => [{ id: 1, storeId: 9 }],
        then: (resolve: any) => resolve([{ name: 'QA store' }]),
      }
      return chain
    },
    update: () => ({ set: () => ({ where: async () => {} }) }),
  },
}))
mock.module('@/services/auth', () => ({
  requireAuth: async () => ({ id: 'trusted-actor' }),
}))
mock.module('@/features/receipt/templates/order', () => ({ OrderTemplate: {
  render: async (input: any) => { receiptInput = input; return 'QA receipt' },
} }))
mock.module('@/features/order/db', () => ({
  checkStockAvailability: async () => [],
  addOrderAuditNoteOnDb: async () => {},
  createOrderAuditEventOnDb: async () => {},
  createOrderItemOnDb: async () => {},
  createOrderItemOptionsOnDb: async () => {},
  createOrderOnDb: async () => {},
  createOrderPaymentOnDb: async () => {},
  getNextOrderDisplayIdForStore: async () => {},
  updateOrderItemInventoryOnDb: async () => {},
  transitionOrderOnDb: async () => {},
}))
mock.module('./completed-cancellation', () => ({
  cancelCompletedOrderOnDb: async (input: any) => {
    if (backendFailure) throw new Error('private-ledger 11999999999')
    backendCalls.push(input)
    return { status: 'CANCELLED' }
  },
  confirmManualRefundReviewOnDb: async (input: any) => {
    if (backendFailure) throw new Error('private-ledger 11999999999')
    backendCalls.push(input)
    return { reviewStatus: 'documented' }
  },
}))
const {
  cancelCompletedOrder,
  confirmManualRefundReview,
  listOrderManualRefunds,
  listOrders,
  generateOrderReceipt,
} = await import('./api')
const command = {
  storeId: 9,
  orderId: 1,
  reason: 'Erro operacional',
  idempotencyKey: '60a20d59-0000-4000-8000-000000000001',
}

test('receipt reprint passes trusted persisted wallet totals, not forged amountDue', async () => {
  receiptOrder = { id: 1, storeId: 9, totalPrice: '20.0000', displayId: '1', type: 'TAKEOUT',
    items: [], payments: [], snapshot: { totals: { cashbackApplied: '4.25', amountDue: '999.00' } } }
  await generateOrderReceipt(1)
  assert.equal(receiptInput.cashbackApplied, '4.25')
  assert.equal(receiptInput.amountDue, '15.75')
  assert.equal(receiptInput.totalPrice, 20)
  receiptOrder.snapshot = null
  await generateOrderReceipt(1)
  assert.equal(receiptInput.cashbackApplied, '0.00')
  assert.equal(receiptInput.amountDue, '20.00')
})

test('both mutations authorize owner/manager and inject authenticated actor and transaction', async () => {
  backendCalls = []
  for (const allowedRole of ['owner', 'manager'] as const) {
    role = allowedRole
    await cancelCompletedOrder(command)
    await confirmManualRefundReview(command)
  }
  assert.equal(backendCalls.length, 4)
  for (const input of backendCalls) {
    assert.equal(input.actorUserId, 'trusted-actor')
    assert.equal(input.dbSession, tx)
    assert.equal(input.idempotencyKey, command.idempotencyKey)
  }
})

test('all three actions reject staff, wrong tenant and blocked access before starting transaction', async () => {
  const before = transactions
  for (const deniedRole of [
    'cashier',
    'attendant',
    'waiter',
    'courier',
  ] as const) {
    role = deniedRole
    await assert.rejects(() => cancelCompletedOrder(command), /FORBIDDEN/)
    await assert.rejects(() => confirmManualRefundReview(command), /FORBIDDEN/)
    await assert.rejects(
      () => listOrderManualRefunds({ storeId: 9, orderId: 1 }),
      /FORBIDDEN/
    )
  }
  role = 'manager'
  await assert.rejects(
    () => cancelCompletedOrder({ ...command, storeId: 10 }),
    /FORBIDDEN/
  )
  blocked = true
  await assert.rejects(() => confirmManualRefundReview(command), /FORBIDDEN/)
  await assert.rejects(
    () => listOrderManualRefunds({ storeId: 9, orderId: 1 }),
    /FORBIDDEN/
  )
  blocked = false
  assert.equal(transactions, before)
})

test('invalid payload cannot pass forged actor, blank reason or missing idempotency key', async () => {
  const before = transactions
  for (const action of [cancelCompletedOrder, confirmManualRefundReview]) {
    await assert.rejects(() =>
      action({ ...command, actorUserId: 'forged' } as any)
    )
    await assert.rejects(() => action({ ...command, reason: ' ' }))
    await assert.rejects(() => action({ ...command, idempotencyKey: '' }))
  }
  assert.equal(transactions, before)
})

test('mutation error boundary never exposes raw ledger errors or attaches their cause', async () => {
  role = 'owner'
  backendFailure = true
  try {
    for (const action of [cancelCompletedOrder, confirmManualRefundReview]) {
      await assert.rejects(
        () => action(command),
        (error: any) => {
          assert.equal(
            error.message,
            'Nao foi possivel registrar a operacao. Atualize o pedido e tente novamente com a mesma chave.'
          )
          assert.equal(error.cause, undefined)
          assert.equal(String(error.stack).includes('11999999999'), false)
          return true
        }
      )
    }
  } finally {
    backendFailure = false
  }
})

test('list action authorizes on server, scopes order/store and exposes documentary reasons only', async () => {
  role = 'owner'
  records = []
  assert.deepEqual(await listOrderManualRefunds({ storeId: 9, orderId: 1 }), [])
  assert.deepEqual(queryParams, [1, 9])
  records = [
    {
      id: 1,
      orderId: 1,
      storeId: 9,
      reason: 'Erro operacional',
      confirmationReason: null,
      actorUserId: 'private-actor',
      idempotencyKey: command.idempotencyKey,
      paymentSnapshot: [
        { id: 4, type: 'PREPAID', method: 'PIX', value: '20.0000' },
      ],
      reviewStatus: 'manual_review_pending',
      confirmedAt: null,
      createdAt: new Date(),
    },
  ]
  const [result] = await listOrderManualRefunds({ storeId: 9, orderId: 1 })
  assert.equal(result.reason, 'Erro operacional')
  assert.equal(result.reviewStatus, 'manual_review_pending')
  assert.equal(result.prepaidRecordedAmount, '20.0000')
  assert.equal(result.receiptVerified, false)
  assert.equal('actorUserId' in result, false)
  assert.equal('idempotencyKey' in result, false)
})

test('listOrders capability comes from existing permission result; wallet comes from persisted totals', async () => {
  rows = [
    {
      id: 1,
      totalPrice: '20.0000',
      status: 'COMPLETED',
      items: [],
      payments: [],
      auditEvents: [],
      snapshot: { totals: { cashbackApplied: '4.25', amountDue: 'forged' } },
    },
  ]
  for (const currentRole of [
    'owner',
    'manager',
    'attendant',
    'cashier',
    'waiter',
  ] as const) {
    role = currentRole
    requestedPermissions = []
    const [result] = await listOrders(9)
    assert.equal(
      result.canCancelCompleted,
      ['owner', 'manager'].includes(currentRole)
    )
    assert.equal(result.cashbackApplied, '4.25')
    assert.equal(result.amountDue, '15.75')
    assert.deepEqual(requestedPermissions, [
      { storeId: 9, permission: 'orders.manage' },
    ])
  }
  rows[0].snapshot = null
  assert.equal((await listOrders(9))[0].amountDue, '20.00')
})
