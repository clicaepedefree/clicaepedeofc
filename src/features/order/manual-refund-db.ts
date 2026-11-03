import { and, eq } from 'drizzle-orm'
import type { DbTransaction } from '@/services/db/types'
import {
  manualRefundsTable,
  type SelectManualRefund,
} from '@/services/db/schema/manual-refunds'
import {
  manualReconciliationNotice,
  summarizeManualRefundPayments,
} from './manual-refund-policy'

export async function getManualRefundOnDb(
  orderId: number,
  storeId: number,
  tx: DbTransaction
) {
  const [record] = await tx
    .select()
    .from(manualRefundsTable)
    .where(
      and(
        eq(manualRefundsTable.orderId, orderId),
        eq(manualRefundsTable.storeId, storeId)
      )
    )
    .limit(1)
  return record
}

export function toManualRefundResult(
  record: SelectManualRefund,
  replayed: boolean
) {
  const summary = summarizeManualRefundPayments(record.paymentSnapshot)
  return {
    orderId: record.orderId,
    storeId: record.storeId,
    status: 'CANCELLED' as const,
    manualRefundId: record.id,
    ...summary,
    reviewStatus: record.reviewStatus,
    confirmedAt: record.confirmedAt,
    manualFinancialReconciliationRequired: record.paymentSnapshot.length > 0,
    financialNotice: manualReconciliationNotice,
    cashRefundExecuted: false as const,
    stockRestocked: false as const,
    replayed,
  }
}
