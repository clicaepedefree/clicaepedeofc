const BLOCKABLE_INVOICE_STATUSES = new Set(['pending', 'overdue'])
const BILLABLE_SUBSCRIPTION_STATUSES = new Set([
  'trialing',
  'active',
  'past_due',
])

export type BillingDelinquencyInvoiceSnapshot = {
  id: number
  invoiceNumber: string
  status: string
  dueAt: Date
  totalAmount: string | number
  amountPaid: string | number
}

export type BillingDelinquencySubscriptionSnapshot = {
  id: number
  status: string
  paymentGraceDays: number
  billingAccessExemptionKind: string | null
  billingAccessExemptUntil: Date | null
  billingAccessExemptionReason: string | null
}

export type BillingDelinquencyStoreSnapshot = {
  id: number
  status: string
}

export type BillingDelinquencyDecision =
  | {
      action: 'block'
      blockAt: Date
      outstandingAmount: number
      dedupeKey: string
      reasonCode: 'invoice_overdue_after_grace'
    }
  | {
      action: 'skip'
      reason:
        | 'invoice_not_blockable'
        | 'invoice_not_due_after_grace'
        | 'invoice_without_open_balance'
        | 'subscription_not_billable'
        | 'store_not_active'
        | 'active_access_block_exists'
        | 'active_billing_access_exemption'
    }

const toMoneyNumber = (value: string | number) => {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

export const addGraceDays = (date: Date, days: number) => {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + Math.max(0, Math.trunc(days)))
  return result
}

export const getOutstandingInvoiceAmount = ({
  totalAmount,
  amountPaid,
}: Pick<BillingDelinquencyInvoiceSnapshot, 'totalAmount' | 'amountPaid'>) =>
  Math.max(0, toMoneyNumber(totalAmount) - toMoneyNumber(amountPaid))

export const isBillingAccessExemptionActive = ({
  billingAccessExemptionKind,
  billingAccessExemptUntil,
  now = new Date(),
}: Pick<
  BillingDelinquencySubscriptionSnapshot,
  'billingAccessExemptionKind' | 'billingAccessExemptUntil'
> & {
  now?: Date
}) =>
  Boolean(
    billingAccessExemptionKind &&
      billingAccessExemptUntil &&
      billingAccessExemptUntil > now
  )

export function decideBillingDelinquencyAccessBlock({
  invoice,
  subscription,
  store,
  hasActiveAccessBlock,
  now = new Date(),
}: {
  invoice: BillingDelinquencyInvoiceSnapshot
  subscription: BillingDelinquencySubscriptionSnapshot
  store: BillingDelinquencyStoreSnapshot
  hasActiveAccessBlock: boolean
  now?: Date
}): BillingDelinquencyDecision {
  if (!BLOCKABLE_INVOICE_STATUSES.has(invoice.status)) {
    return { action: 'skip', reason: 'invoice_not_blockable' }
  }

  const outstandingAmount = getOutstandingInvoiceAmount(invoice)
  if (outstandingAmount <= 0) {
    return { action: 'skip', reason: 'invoice_without_open_balance' }
  }

  const blockAt = addGraceDays(invoice.dueAt, subscription.paymentGraceDays)
  if (blockAt > now) {
    return { action: 'skip', reason: 'invoice_not_due_after_grace' }
  }

  if (!BILLABLE_SUBSCRIPTION_STATUSES.has(subscription.status)) {
    return { action: 'skip', reason: 'subscription_not_billable' }
  }

  if (store.status !== 'active') {
    return { action: 'skip', reason: 'store_not_active' }
  }

  if (hasActiveAccessBlock) {
    return { action: 'skip', reason: 'active_access_block_exists' }
  }

  if (
    isBillingAccessExemptionActive({
      billingAccessExemptionKind: subscription.billingAccessExemptionKind,
      billingAccessExemptUntil: subscription.billingAccessExemptUntil,
      now,
    })
  ) {
    return { action: 'skip', reason: 'active_billing_access_exemption' }
  }

  return {
    action: 'block',
    blockAt,
    outstandingAmount,
    dedupeKey: `billing-delinquency:invoice:${invoice.id}`,
    reasonCode: 'invoice_overdue_after_grace',
  }
}
