import { and, eq } from 'drizzle-orm'
import type { DbTransaction } from '@/services/db/types'
import { ordersTable } from '@/services/db/schema/orders'
import { orderPaymentsTable } from '@/services/db/schema/order-payments'
import { manualRefundsTable } from '@/services/db/schema/manual-refunds'
import { publicOrderSubmissionsTable } from '@/services/db/schema/public-order-submissions'
import { publicOrderEventsTable } from '@/services/db/schema/public-order-events'
import { settleOrderBenefits } from '@/features/benefit-programs/ledger'
import {
  createOrderAuditEventOnDb,
  enqueueOrderStatusWhatsappNotificationOnDb,
} from './db'
import { getManualRefundOnDb, toManualRefundResult } from './manual-refund-db'
import {
  assertCompletedCancellationStatus,
  assertSameManualRefundCommand,
  completedCancellationCommandSchema,
  summarizeManualRefundPayments,
  type CompletedCancellationCommand,
} from './manual-refund-policy'

type Command = CompletedCancellationCommand & {
  actorUserId: string
  dbSession: DbTransaction
}

async function lockOrder(orderId: number, storeId: number, tx: DbTransaction) {
  const [order] = await tx
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.storeId, storeId)))
    .limit(1)
    .for('update')
  if (!order) throw new Error('ORDER_NOT_FOUND')
  return order
}

export async function cancelCompletedOrderOnDb(input: Command) {
  const command = completedCancellationCommandSchema.parse({
    storeId: input.storeId,
    orderId: input.orderId,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
  })
  const { orderId, storeId, reason, idempotencyKey } = command
  const tx = input.dbSession
  const order = await lockOrder(orderId, storeId, tx)
  const previous = await getManualRefundOnDb(orderId, storeId, tx)
  if (previous) {
    assertSameManualRefundCommand(previous, {
      ...command,
      actorUserId: input.actorUserId,
    })
    if (order.status !== 'CANCELLED')
      throw new Error('MANUAL_REFUND_ORDER_STATE_CONFLICT')
    return toManualRefundResult(previous, true)
  }
  assertCompletedCancellationStatus(order.status)
  const payments = await tx
    .select()
    .from(orderPaymentsTable)
    .where(eq(orderPaymentsTable.orderId, orderId))
    .orderBy(orderPaymentsTable.id)
  const summary = summarizeManualRefundPayments(payments)
  const [record] = await tx
    .insert(manualRefundsTable)
    .values({
      orderId,
      storeId,
      reason,
      idempotencyKey,
      actorUserId: input.actorUserId,
      paymentSnapshot: summary.payments,
      reviewStatus: summary.reviewStatus,
    })
    .returning()
  const at = new Date()
  const [cancelled] = await tx
    .update(ordersTable)
    .set({ status: 'CANCELLED', cancelledAt: at })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.storeId, storeId)))
    .returning()
  const requestId = `kan159:cancel:${storeId}:${idempotencyKey}`
  const [submission] = await tx
    .update(publicOrderSubmissionsTable)
    .set({ status: 'CANCELLED', cancelledAt: at })
    .where(
      and(
        eq(publicOrderSubmissionsTable.orderId, orderId),
        eq(publicOrderSubmissionsTable.storeId, storeId)
      )
    )
    .returning({ id: publicOrderSubmissionsTable.id })
  if (submission)
    await tx.insert(publicOrderEventsTable).values({
      publicOrderId: submission.id,
      storeId,
      eventType: 'public_order_status_changed',
      fromStatus: 'COMPLETED',
      toStatus: 'CANCELLED',
      actorType: 'store',
      actorUserId: input.actorUserId,
      requestId,
      payload: {},
    })
  await createOrderAuditEventOnDb({
    dbSession: tx,
    event: {
      orderId,
      storeId,
      eventType: 'status_changed',
      fromStatus: 'COMPLETED',
      toStatus: 'CANCELLED',
      actorType: 'store',
      actorUserId: input.actorUserId,
      origin: 'MANUAL',
      reason,
      requestId,
      metadata: {
        salesChannel: order.salesChannel,
        displayId: order.displayId,
      },
    },
  })
  // Deliberately fail closed: a benefit adjustment failure rolls back the cancellation.
  await settleOrderBenefits(cancelled, tx)
  await enqueueOrderStatusWhatsappNotificationOnDb({
    order: cancelled,
    fromStatus: 'COMPLETED',
    toStatus: 'CANCELLED',
    reason: null,
    dbSession: tx,
  })
  return toManualRefundResult(record, false)
}

export async function confirmManualRefundReviewOnDb(input: Command) {
  const command = completedCancellationCommandSchema.parse({
    storeId: input.storeId,
    orderId: input.orderId,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
  })
  const { orderId, storeId, reason, idempotencyKey } = command
  const tx = input.dbSession
  const order = await lockOrder(orderId, storeId, tx)
  if (order.status !== 'CANCELLED')
    throw new Error('MANUAL_REFUND_REQUIRES_CANCELLED')
  const record = await getManualRefundOnDb(orderId, storeId, tx)
  if (!record || record.reviewStatus === 'not_required')
    throw new Error('MANUAL_REFUND_REVIEW_NOT_REQUIRED')
  if (record.reviewStatus === 'documented') {
    assertSameManualRefundCommand(
      {
        idempotencyKey: record.confirmationKey!,
        reason: record.confirmationReason!,
        actorUserId: record.confirmedByUserId!,
      },
      { ...command, actorUserId: input.actorUserId }
    )
    return toManualRefundResult(record, true)
  }
  const [documented] = await tx
    .update(manualRefundsTable)
    .set({
      reviewStatus: 'documented',
      confirmationKey: idempotencyKey,
      confirmationReason: reason,
      confirmedByUserId: input.actorUserId,
      confirmedAt: new Date(),
    })
    .where(
      and(
        eq(manualRefundsTable.id, record.id),
        eq(manualRefundsTable.storeId, storeId)
      )
    )
    .returning()
  await createOrderAuditEventOnDb({
    dbSession: tx,
    event: {
      orderId,
      storeId,
      eventType: 'note_added',
      fromStatus: null,
      toStatus: null,
      actorType: 'store',
      actorUserId: input.actorUserId,
      origin: 'MANUAL',
      reason,
      requestId: `kan159:review:${storeId}:${idempotencyKey}`,
      metadata: {},
    },
  })
  return toManualRefundResult(documented, false)
}
