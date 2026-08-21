import type {
  SelectBillingReminderRule,
  billingReminderChannels,
} from '@/services/db/schema/billing-reminder-rules'
import type { SelectStoreBillingInvoice } from '@/services/db/schema/store-billing-invoices'

export type BillingReminderChannel = (typeof billingReminderChannels)[number]

export type BillingReminderInvoice = Pick<
  SelectStoreBillingInvoice,
  | 'id'
  | 'invoiceNumber'
  | 'status'
  | 'totalAmount'
  | 'amountPaid'
  | 'dueAt'
>

export type BillingReminderRule = Pick<
  SelectBillingReminderRule,
  | 'id'
  | 'storeId'
  | 'channel'
  | 'daysAfterDue'
  | 'status'
  | 'title'
  | 'messageTemplate'
>

export type BillingReminderDraft = {
  ruleId: number | null
  channel: BillingReminderChannel
  daysAfterDue: number
  title: string
  message: string
  dedupeKey: string
  expectedBlockAt: Date
}

const dayInMs = 24 * 60 * 60 * 1000

const parseAmount = (value: string | number | null | undefined) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const startOfUtcDay = (date: Date) =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())

const formatIsoDate = (date: Date) => date.toISOString().slice(0, 10)

export const getExpectedBillingInvoiceBlockAt = ({
  dueAt,
  paymentGraceDays,
}: {
  dueAt: Date
  paymentGraceDays: number
}) => {
  const expectedBlockAt = new Date(dueAt)
  expectedBlockAt.setUTCDate(
    expectedBlockAt.getUTCDate() + Math.max(0, Math.trunc(paymentGraceDays))
  )
  return expectedBlockAt
}

export const getBillingReminderDaysAfterDue = ({
  dueAt,
  now,
}: {
  dueAt: Date
  now: Date
}) => {
  if (now.getTime() < dueAt.getTime()) return null

  return Math.max(
    0,
    Math.floor((startOfUtcDay(now) - startOfUtcDay(dueAt)) / dayInMs)
  )
}

export const getBillingReminderOutstandingAmount = (
  invoice: Pick<BillingReminderInvoice, 'totalAmount' | 'amountPaid'>
) => Math.max(0, parseAmount(invoice.totalAmount) - parseAmount(invoice.amountPaid))

export const shouldStopBillingRemindersForInvoice = (
  invoice: Pick<
    BillingReminderInvoice,
    'status' | 'totalAmount' | 'amountPaid'
  >
) => {
  if (invoice.status === 'paid' || invoice.status === 'cancelled') return true
  if (invoice.status === 'refunded') return true

  return getBillingReminderOutstandingAmount(invoice) <= 0
}

export const buildBillingReminderDedupeKey = ({
  invoiceId,
  channel,
  daysAfterDue,
}: {
  invoiceId: number
  channel: BillingReminderChannel
  daysAfterDue: number
}) => `billing-reminder:${invoiceId}:${channel}:${daysAfterDue}`

const renderReminderMessage = ({
  template,
  invoice,
  daysAfterDue,
  expectedBlockAt,
}: {
  template: string | null
  invoice: Pick<BillingReminderInvoice, 'invoiceNumber'>
  daysAfterDue: number
  expectedBlockAt: Date
}) => {
  const fallback =
    'A fatura {{invoiceNumber}} esta em aberto. Bloqueio previsto em {{expectedBlockAt}}.'

  return (template ?? fallback)
    .replaceAll('{{invoiceNumber}}', invoice.invoiceNumber)
    .replaceAll('{{daysAfterDue}}', String(daysAfterDue))
    .replaceAll('{{expectedBlockAt}}', formatIsoDate(expectedBlockAt))
}

export const selectDueBillingReminderDrafts = ({
  invoice,
  rules,
  existingDedupeKeys,
  now,
  paymentGraceDays,
}: {
  invoice: BillingReminderInvoice
  rules: BillingReminderRule[]
  existingDedupeKeys: ReadonlySet<string>
  now: Date
  paymentGraceDays: number
}): BillingReminderDraft[] => {
  if (shouldStopBillingRemindersForInvoice(invoice)) return []

  const daysAfterDue = getBillingReminderDaysAfterDue({
    dueAt: invoice.dueAt,
    now,
  })

  if (daysAfterDue === null) return []

  const expectedBlockAt = getExpectedBillingInvoiceBlockAt({
    dueAt: invoice.dueAt,
    paymentGraceDays,
  })

  return rules
    .filter(rule => rule.status === 'active')
    .filter(rule => rule.daysAfterDue <= daysAfterDue)
    .map(rule => ({
      ruleId: rule.id,
      channel: rule.channel,
      daysAfterDue: rule.daysAfterDue,
      title: rule.title,
      message: renderReminderMessage({
        template: rule.messageTemplate,
        invoice,
        daysAfterDue: rule.daysAfterDue,
        expectedBlockAt,
      }),
      dedupeKey: buildBillingReminderDedupeKey({
        invoiceId: invoice.id,
        channel: rule.channel,
        daysAfterDue: rule.daysAfterDue,
      }),
      expectedBlockAt,
    }))
    .filter(draft => !existingDedupeKeys.has(draft.dedupeKey))
}

export const getBillingReminderChannelLabel = (
  channel: BillingReminderChannel
) => {
  const labels: Record<BillingReminderChannel, string> = {
    email: 'E-mail',
    whatsapp: 'WhatsApp',
    system: 'Sistema',
  }

  return labels[channel]
}

