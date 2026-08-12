import {
  billingIntervals,
  type SelectBillingPlan,
} from '@/services/db/schema/billing-plans'
import {
  storeBillingInvoiceStatuses,
  type InsertStoreBillingInvoice,
} from '@/services/db/schema/store-billing-invoices'
import type { SelectStoreSubscription } from '@/services/db/schema/store-subscriptions'
import Decimal from 'decimal.js'

export type BillingInterval = (typeof billingIntervals)[number]

export type BillingPeriod = {
  periodStart: Date
  periodEnd: Date
  nextBillingAt: Date
}

export type BillingInvoiceDraftInput = {
  invoiceNumber: string
  dueAt: Date
  plan: Pick<
    SelectBillingPlan,
    | 'id'
    | 'code'
    | 'name'
    | 'defaultAmount'
    | 'currency'
    | 'billingInterval'
    | 'billingIntervalCount'
  >
  subscription: Pick<
    SelectStoreSubscription,
    | 'id'
    | 'storeId'
    | 'planId'
    | 'contractedAmount'
    | 'currency'
    | 'billingInterval'
    | 'billingIntervalCount'
    | 'discountType'
    | 'discountValue'
    | 'currentPeriodStart'
    | 'currentPeriodEnd'
  >
}

export const supportedBillingInvoiceStatuses = [
  ...storeBillingInvoiceStatuses,
] as const

const intervalToMonths: Record<BillingInterval, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
}

const normalizePositiveCount = (count: number) =>
  Number.isFinite(count) && count > 0 ? Math.trunc(count) : 1

const lastDayOfMonth = (year: number, monthIndex: number) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()

const addMonthsClamped = (date: Date, months: number) => {
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const target = new Date(
    Date.UTC(
      year,
      month + months,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  )
  const targetDay = Math.min(
    day,
    lastDayOfMonth(target.getUTCFullYear(), target.getUTCMonth())
  )
  target.setUTCDate(targetDay)
  return target
}

export const calculateNextBillingPeriod = ({
  currentPeriodEnd,
  billingInterval,
  billingIntervalCount,
}: {
  currentPeriodEnd: Date
  billingInterval: BillingInterval
  billingIntervalCount: number
}): BillingPeriod => {
  const periodStart = new Date(currentPeriodEnd)
  const intervalMonths =
    intervalToMonths[billingInterval] *
    normalizePositiveCount(billingIntervalCount)
  const periodEnd = addMonthsClamped(periodStart, intervalMonths)

  return {
    periodStart,
    periodEnd,
    nextBillingAt: periodEnd,
  }
}

export const calculateBillingInvoiceAmounts = ({
  contractedAmount,
  discountType,
  discountValue,
}: Pick<
  SelectStoreSubscription,
  'contractedAmount' | 'discountType' | 'discountValue'
>) => {
  const subtotal = new Decimal(contractedAmount)
  const rawDiscount = new Decimal(discountValue ?? 0)
  const discount =
    discountType === 'percentage'
      ? subtotal.mul(rawDiscount).div(100)
      : discountType === 'fixed_amount'
        ? rawDiscount
        : new Decimal(0)
  const safeDiscount = Decimal.min(Decimal.max(discount, 0), subtotal)
  const total = subtotal.minus(safeDiscount)

  return {
    subtotalAmount: subtotal.toFixed(4),
    discountAmount: safeDiscount.toFixed(4),
    totalAmount: total.toFixed(4),
  }
}

export const buildBillingInvoiceDraft = ({
  invoiceNumber,
  dueAt,
  plan,
  subscription,
}: BillingInvoiceDraftInput): InsertStoreBillingInvoice => {
  if (plan.id !== subscription.planId) {
    throw new Error('Billing plan does not match subscription plan')
  }

  const amounts = calculateBillingInvoiceAmounts(subscription)

  return {
    storeId: subscription.storeId,
    subscriptionId: subscription.id,
    planId: subscription.planId,
    invoiceNumber,
    status: 'pending',
    currency: subscription.currency,
    periodStart: subscription.currentPeriodStart,
    periodEnd: subscription.currentPeriodEnd,
    dueAt,
    amountPaid: '0',
    amountRefunded: '0',
    ...amounts,
    planSnapshot: {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      defaultAmount: plan.defaultAmount,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      billingIntervalCount: plan.billingIntervalCount,
    },
    contractSnapshot: {
      contractedAmount: subscription.contractedAmount,
      currency: subscription.currency,
      billingInterval: subscription.billingInterval,
      billingIntervalCount: subscription.billingIntervalCount,
      discountType: subscription.discountType,
      discountValue: subscription.discountValue,
    },
    metadata: {},
  }
}
