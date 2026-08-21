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

export type RecurringBillingGenerationInput = {
  status: SelectStoreSubscription['status']
  nextBillingAt: Date
  now: Date
  invoiceLeadDays: number
}

export type RecurringBillingInvoiceNumberInput = {
  storeId: number
  subscriptionId: number
  periodStart: Date
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
    | 'discountValidUntil'
    | 'currentPeriodStart'
    | 'currentPeriodEnd'
  >
}

export type RecurringBillingInvoiceDraftInput = Omit<
  BillingInvoiceDraftInput,
  'subscription'
> & {
  subscription: BillingInvoiceDraftInput['subscription'] &
    Pick<SelectStoreSubscription, 'status'>
}

export type RecurringBillingInvoiceDraft = {
  invoice: InsertStoreBillingInvoice
  nextPeriod: BillingPeriod
  nextSubscriptionStatus: SelectStoreSubscription['status']
}

export const supportedBillingInvoiceStatuses = [
  ...storeBillingInvoiceStatuses,
] as const

export const recurringBillingEligibleStatuses = [
  'trialing',
  'active',
  'past_due',
] as const satisfies SelectStoreSubscription['status'][]

const recurringBillingEligibleStatusSet: ReadonlySet<
  SelectStoreSubscription['status']
> = new Set(recurringBillingEligibleStatuses)

const intervalToMonths: Record<BillingInterval, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
}

const normalizePositiveCount = (count: number) =>
  Number.isFinite(count) && count > 0 ? Math.trunc(count) : 1

export const normalizeInvoiceLeadDays = (invoiceLeadDays: number) =>
  Number.isFinite(invoiceLeadDays) && invoiceLeadDays >= 0
    ? Math.min(Math.trunc(invoiceLeadDays), 60)
    : 7

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

export const calculateRecurringBillingGenerationCutoff = ({
  now,
  invoiceLeadDays,
}: {
  now: Date
  invoiceLeadDays: number
}) => {
  const cutoff = new Date(now)
  cutoff.setUTCDate(
    cutoff.getUTCDate() + normalizeInvoiceLeadDays(invoiceLeadDays)
  )
  return cutoff
}

export const shouldGenerateRecurringBillingInvoice = ({
  status,
  nextBillingAt,
  now,
  invoiceLeadDays,
}: RecurringBillingGenerationInput) => {
  if (!recurringBillingEligibleStatusSet.has(status)) {
    return false
  }

  return (
    nextBillingAt.getTime() <=
    calculateRecurringBillingGenerationCutoff({
      now,
      invoiceLeadDays,
    }).getTime()
  )
}

const formatInvoicePeriodDate = (date: Date) =>
  [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('')

export const buildRecurringBillingInvoiceNumber = ({
  storeId,
  subscriptionId,
  periodStart,
}: RecurringBillingInvoiceNumberInput) =>
  `CP-${storeId}-REC-${subscriptionId}-${formatInvoicePeriodDate(periodStart)}`

export const buildRecurringBillingInvoiceDraft = ({
  invoiceNumber,
  dueAt,
  plan,
  subscription,
}: RecurringBillingInvoiceDraftInput): RecurringBillingInvoiceDraft => {
  const nextPeriod = calculateNextBillingPeriod({
    currentPeriodEnd: subscription.currentPeriodEnd,
    billingInterval: subscription.billingInterval,
    billingIntervalCount: subscription.billingIntervalCount,
  })
  const billableSubscription = {
    ...subscription,
    currentPeriodStart: nextPeriod.periodStart,
    currentPeriodEnd: nextPeriod.periodEnd,
  }

  return {
    invoice: buildBillingInvoiceDraft({
      invoiceNumber,
      dueAt,
      plan,
      subscription: billableSubscription,
    }),
    nextPeriod,
    nextSubscriptionStatus:
      subscription.status === 'trialing' ? 'active' : subscription.status,
  }
}

export const calculateBillingInvoiceAmounts = ({
  contractedAmount,
  discountType,
  discountValue,
  discountValidUntil,
  referenceDate = new Date(),
}: Pick<
  SelectStoreSubscription,
  'contractedAmount' | 'discountType' | 'discountValue'
> & {
  discountValidUntil?: Date | null
  referenceDate?: Date
}) => {
  const subtotal = new Decimal(contractedAmount)
  const discountExpired =
    discountValidUntil instanceof Date &&
    discountValidUntil.getTime() < referenceDate.getTime()
  const rawDiscount = new Decimal(discountExpired ? 0 : (discountValue ?? 0))
  const discount =
    !discountExpired && discountType === 'percentage'
      ? subtotal.mul(rawDiscount).div(100)
      : !discountExpired && discountType === 'fixed_amount'
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

  const amounts = calculateBillingInvoiceAmounts({
    ...subscription,
    referenceDate: dueAt,
  })

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
      discountValidUntil: subscription.discountValidUntil,
    },
    metadata: {},
  }
}
