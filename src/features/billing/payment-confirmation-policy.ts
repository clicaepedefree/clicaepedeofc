export type PaymentConfirmationInvoiceSnapshot = {
  id: number
  status: string
  totalAmount: string | number
  amountPaid: string | number
  amountRefunded: string | number
  paidAt: Date | null
}

export type PaymentConfirmationAccessBlockSnapshot = {
  id: number
  source: string
  invoiceId: number | null
  unblockedAt: Date | null
}

export type PaymentConfirmationResult = {
  nextAmountPaid: string
  nextStatus: 'pending' | 'paid'
  nextPaidAt: Date | null
  outstandingBeforePayment: number
}

const toMoneyNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined) return 0
  const parsed = typeof value === 'number' ? value : Number(value)

  return Number.isFinite(parsed) ? parsed : 0
}

export const formatConfirmedPaymentAmount = (value: number) => value.toFixed(4)

export const getPaymentConfirmationOutstandingAmount = (
  invoice: PaymentConfirmationInvoiceSnapshot
) =>
  Math.max(
    0,
    toMoneyNumber(invoice.totalAmount) -
      toMoneyNumber(invoice.amountPaid) +
      toMoneyNumber(invoice.amountRefunded)
  )

export function buildPaymentConfirmationDedupeKey({
  invoiceId,
  provider,
  providerPaymentId,
  amount,
  paidAt,
  manualReference,
}: {
  invoiceId: number
  provider: string
  providerPaymentId?: string | null
  amount: string | number
  paidAt: Date
  manualReference?: string | null
}) {
  const normalizedProviderPaymentId = providerPaymentId?.trim()
  if (normalizedProviderPaymentId) {
    return `${provider}:${normalizedProviderPaymentId}`
  }

  return [
    provider,
    `invoice:${invoiceId}`,
    `amount:${formatConfirmedPaymentAmount(toMoneyNumber(amount))}`,
    `paid_at:${paidAt.toISOString()}`,
    `ref:${manualReference?.trim().toLowerCase() ?? ''}`,
  ].join(':')
}

export function reconcileConfirmedPayment({
  invoice,
  amount,
  paidAt,
}: {
  invoice: PaymentConfirmationInvoiceSnapshot
  amount: string | number
  paidAt: Date
}): PaymentConfirmationResult {
  const parsedAmount = toMoneyNumber(amount)
  const outstandingBeforePayment =
    getPaymentConfirmationOutstandingAmount(invoice)

  if (parsedAmount <= 0) throw new Error('PAYMENT_AMOUNT_INVALID')
  if (parsedAmount > outstandingBeforePayment) {
    throw new Error('PAYMENT_EXCEEDS_OUTSTANDING')
  }

  const nextAmountPaid = toMoneyNumber(invoice.amountPaid) + parsedAmount
  const totalAmount = toMoneyNumber(invoice.totalAmount)
  const nextStatus = nextAmountPaid >= totalAmount ? 'paid' : 'pending'

  return {
    nextAmountPaid: formatConfirmedPaymentAmount(nextAmountPaid),
    nextStatus,
    nextPaidAt: nextStatus === 'paid' ? paidAt : invoice.paidAt,
    outstandingBeforePayment,
  }
}

export function shouldAutoUnblockBillingAccess({
  block,
  invoiceId,
  invoiceStatus,
}: {
  block: PaymentConfirmationAccessBlockSnapshot | null
  invoiceId: number
  invoiceStatus: string
}) {
  return Boolean(
    block &&
      block.source === 'billing_delinquency' &&
      block.invoiceId === invoiceId &&
      !block.unblockedAt &&
      invoiceStatus === 'paid'
  )
}
