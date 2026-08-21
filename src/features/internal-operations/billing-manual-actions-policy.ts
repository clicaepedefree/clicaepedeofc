import { z } from 'zod'

const manualBillingReasonSchema = z
  .string()
  .trim()
  .min(8, 'Informe um motivo com pelo menos 8 caracteres')
  .max(500, 'Use ate 500 caracteres')

const positiveMoneySchema = z
  .string()
  .trim()
  .regex(/^\d+(?:[.,]\d{1,2})?$/, 'Informe um valor valido')
  .refine(
    value => parseMoneyAmount(value) > 0,
    'Informe um valor maior que zero'
  )

const optionalReferenceSchema = z
  .string()
  .trim()
  .max(120, 'Use ate 120 caracteres')
  .optional()
  .or(z.literal(''))

export const manualBillingActionTypes = [
  'create_invoice',
  'mark_payment',
  'reschedule_due_date',
  'apply_adjustment',
  'cancel_invoice',
  'refund_invoice',
] as const

export type ManualBillingActionType = (typeof manualBillingActionTypes)[number]

export const manualInvoiceAdjustmentTypes = ['discount', 'surcharge'] as const

export type ManualInvoiceAdjustmentType =
  (typeof manualInvoiceAdjustmentTypes)[number]

export const createManualBillingInvoiceSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  amount: positiveMoneySchema,
  dueAt: z.coerce.date(),
  description: z
    .string()
    .trim()
    .min(3, 'Descreva a cobranca avulsa')
    .max(180, 'Use ate 180 caracteres'),
  reason: manualBillingReasonSchema,
})

export const markManualBillingInvoicePaymentSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  invoiceId: z.coerce.number().int().positive(),
  amount: positiveMoneySchema,
  paidAt: z.coerce.date(),
  paymentReference: optionalReferenceSchema,
  reason: manualBillingReasonSchema,
})

export const rescheduleBillingInvoiceDueDateSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  invoiceId: z.coerce.number().int().positive(),
  dueAt: z.coerce.date(),
  reason: manualBillingReasonSchema,
})

export const adjustBillingInvoiceAmountSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  invoiceId: z.coerce.number().int().positive(),
  adjustmentType: z.enum(manualInvoiceAdjustmentTypes),
  amount: positiveMoneySchema,
  reason: manualBillingReasonSchema,
})

export const cancelBillingInvoiceSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  invoiceId: z.coerce.number().int().positive(),
  confirmation: z.string().trim().toUpperCase(),
  reason: manualBillingReasonSchema,
})

export const refundBillingInvoiceSchema = z.object({
  storeId: z.coerce.number().int().positive(),
  invoiceId: z.coerce.number().int().positive(),
  amount: positiveMoneySchema,
  paymentReference: optionalReferenceSchema,
  reason: manualBillingReasonSchema,
})

export type CreateManualBillingInvoiceValues = z.infer<
  typeof createManualBillingInvoiceSchema
>
export type MarkManualBillingInvoicePaymentValues = z.infer<
  typeof markManualBillingInvoicePaymentSchema
>
export type RescheduleBillingInvoiceDueDateValues = z.infer<
  typeof rescheduleBillingInvoiceDueDateSchema
>
export type AdjustBillingInvoiceAmountValues = z.infer<
  typeof adjustBillingInvoiceAmountSchema
>
export type CancelBillingInvoiceValues = z.infer<
  typeof cancelBillingInvoiceSchema
>
export type RefundBillingInvoiceValues = z.infer<
  typeof refundBillingInvoiceSchema
>

export type ManualBillingInvoiceState = {
  status: string
  subtotalAmount: string | number | null
  discountAmount: string | number | null
  totalAmount: string | number | null
  amountPaid: string | number | null
  amountRefunded: string | number | null
  dueAt?: Date | string | null
}

const actionableOpenStatuses = new Set(['pending', 'overdue'])

export function parseMoneyAmount(value: string | number | null | undefined) {
  if (value === null || value === undefined) return 0

  const parsed =
    typeof value === 'number' ? value : Number(value.trim().replace(',', '.'))

  if (!Number.isFinite(parsed)) return 0

  return parsed
}

export function formatMoneyAmount(value: number) {
  return value.toFixed(4)
}

export function getManualInvoiceOutstandingAmount(
  invoice: ManualBillingInvoiceState
) {
  return Math.max(
    0,
    parseMoneyAmount(invoice.totalAmount) -
      parseMoneyAmount(invoice.amountPaid) +
      parseMoneyAmount(invoice.amountRefunded)
  )
}

export function getManualInvoiceRefundableAmount(
  invoice: ManualBillingInvoiceState
) {
  return Math.max(
    0,
    parseMoneyAmount(invoice.amountPaid) -
      parseMoneyAmount(invoice.amountRefunded)
  )
}

export function canRunManualBillingAction({
  action,
  invoice,
}: {
  action: ManualBillingActionType
  invoice?: ManualBillingInvoiceState | null
}) {
  if (action === 'create_invoice') return true
  if (!invoice) return false

  const status = invoice.status
  const isOpen = actionableOpenStatuses.has(status)
  const paidAmount = parseMoneyAmount(invoice.amountPaid)

  if (action === 'mark_payment') {
    return isOpen && getManualInvoiceOutstandingAmount(invoice) > 0
  }

  if (action === 'reschedule_due_date') return isOpen

  if (action === 'apply_adjustment') {
    return isOpen && paidAmount === 0
  }

  if (action === 'cancel_invoice') {
    return isOpen && paidAmount === 0
  }

  if (action === 'refund_invoice') {
    return status === 'paid' && getManualInvoiceRefundableAmount(invoice) > 0
  }

  return false
}

export function assertManualBillingActionAllowed({
  action,
  invoice,
}: {
  action: ManualBillingActionType
  invoice?: ManualBillingInvoiceState | null
}) {
  if (!canRunManualBillingAction({ action, invoice })) {
    throw new Error('MANUAL_BILLING_ACTION_NOT_ALLOWED')
  }
}

export function calculateManualInvoiceAdjustment({
  invoice,
  adjustmentType,
  amount,
}: {
  invoice: ManualBillingInvoiceState
  adjustmentType: ManualInvoiceAdjustmentType
  amount: string | number
}) {
  const parsedAmount = parseMoneyAmount(amount)
  const previousSubtotalAmount = parseMoneyAmount(invoice.subtotalAmount)
  const previousDiscountAmount = parseMoneyAmount(invoice.discountAmount)
  const previousTotalAmount = parseMoneyAmount(invoice.totalAmount)

  if (parsedAmount <= 0) throw new Error('MANUAL_BILLING_AMOUNT_INVALID')

  const nextDiscountAmount =
    adjustmentType === 'discount'
      ? previousDiscountAmount + parsedAmount
      : previousDiscountAmount
  const nextTotalAmount =
    adjustmentType === 'discount'
      ? previousTotalAmount - parsedAmount
      : previousTotalAmount + parsedAmount

  if (nextTotalAmount < 0) {
    throw new Error('MANUAL_BILLING_DISCOUNT_EXCEEDS_TOTAL')
  }

  return {
    subtotalAmount: formatMoneyAmount(previousSubtotalAmount),
    discountAmount: formatMoneyAmount(nextDiscountAmount),
    totalAmount: formatMoneyAmount(nextTotalAmount),
    previousValues: {
      subtotalAmount: formatMoneyAmount(previousSubtotalAmount),
      discountAmount: formatMoneyAmount(previousDiscountAmount),
      totalAmount: formatMoneyAmount(previousTotalAmount),
    },
    newValues: {
      subtotalAmount: formatMoneyAmount(previousSubtotalAmount),
      discountAmount: formatMoneyAmount(nextDiscountAmount),
      totalAmount: formatMoneyAmount(nextTotalAmount),
    },
  }
}
