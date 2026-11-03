import Decimal from 'decimal.js'
import { z } from 'zod'
import { requireAuditReason } from './audit-policy'
import type { SelectOrderPayment } from '@/services/db/schema/order-payments'

export const completedCancellationCommandSchema = z
  .object({
    storeId: z.number().int().positive(),
    orderId: z.number().int().positive(),
    idempotencyKey: z
      .string()
      .uuid()
      .transform(value => value.toLowerCase()),
    reason: z
      .string()
      .transform(value =>
        requireAuditReason(value.replace(/[\u0000-\u001f\u007f]/g, ' '))
      ),
  })
  .strict()

export type CompletedCancellationCommand = z.input<
  typeof completedCancellationCommandSchema
>
export type ManualRefundPaymentSnapshot = Pick<
  SelectOrderPayment,
  'id' | 'type' | 'method' | 'value'
>

export const manualReconciliationNotice =
  'Necessaria conciliacao financeira manual. Este registro nao executa nem comprova reembolso e nao realiza retirada de caixa.'

export function summarizeManualRefundPayments(
  payments: ManualRefundPaymentSnapshot[]
) {
  const sum = (type: ManualRefundPaymentSnapshot['type']) =>
    payments
      .filter(payment => payment.type === type)
      .reduce((total, payment) => total.plus(payment.value), new Decimal(0))
      .toFixed(4)
  return {
    payments: payments.map(({ id, type, method, value }) => ({
      id,
      type,
      method,
      value,
    })),
    prepaidRecordedAmount: sum('PREPAID'),
    pendingNotReceivedAmount: sum('PENDING'),
    receiptVerified: false as const,
    reviewStatus: payments.length
      ? ('manual_review_pending' as const)
      : ('not_required' as const),
  }
}

export function assertCompletedCancellationStatus(status: string) {
  if (status !== 'COMPLETED')
    throw new Error('COMPLETED_CANCELLATION_REQUIRES_COMPLETED')
}

export function assertSameManualRefundCommand(
  previous: { idempotencyKey: string; reason: string; actorUserId: string },
  next: { idempotencyKey: string; reason: string; actorUserId: string }
) {
  if (
    previous.idempotencyKey !== next.idempotencyKey ||
    previous.reason !== next.reason ||
    previous.actorUserId !== next.actorUserId
  ) {
    throw new Error('MANUAL_REFUND_COMMAND_CONFLICT')
  }
}
