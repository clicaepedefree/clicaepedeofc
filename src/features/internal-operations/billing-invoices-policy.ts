import { parseInternalDashboardAmount } from './db'

export const internalInvoiceStatusFilters = [
  'all',
  'open',
  'overdue',
  'paid',
  'closed',
] as const

export type InternalInvoiceStatusFilter =
  (typeof internalInvoiceStatusFilters)[number]

export type InternalInvoiceStatusTone = 'open' | 'overdue' | 'paid' | 'closed'

export type InternalInvoiceForPolicy = {
  status: string
  totalAmount: string | number | null
  amountPaid: string | number | null
  amountRefunded?: string | number | null
  dueAt: Date | string
  paymentLink?: string | null
}

export function parseInternalInvoiceStatusFilter(
  value: string | undefined
): InternalInvoiceStatusFilter {
  return internalInvoiceStatusFilters.includes(
    value as InternalInvoiceStatusFilter
  )
    ? (value as InternalInvoiceStatusFilter)
    : 'all'
}

export function getInternalInvoiceReceivableAmount(
  invoice: Pick<InternalInvoiceForPolicy, 'totalAmount' | 'amountPaid'>
) {
  return Math.max(
    0,
    parseInternalDashboardAmount(invoice.totalAmount) -
      parseInternalDashboardAmount(invoice.amountPaid)
  )
}

export function getInternalInvoiceStatusTone(
  invoice: Pick<InternalInvoiceForPolicy, 'status' | 'dueAt'>,
  now = new Date()
): InternalInvoiceStatusTone {
  if (invoice.status === 'paid') return 'paid'
  if (invoice.status === 'cancelled' || invoice.status === 'refunded') {
    return 'closed'
  }
  if (
    invoice.status === 'overdue' ||
    (invoice.status === 'pending' &&
      new Date(invoice.dueAt).getTime() < now.getTime())
  ) {
    return 'overdue'
  }

  return 'open'
}

export function getInternalInvoiceFilterDescription(
  filter: InternalInvoiceStatusFilter
) {
  const descriptions: Record<InternalInvoiceStatusFilter, string> = {
    all: 'Mostrando ate 50 faturas mais recentes da loja.',
    open: 'Mostrando ate 50 faturas abertas com vencimento futuro.',
    overdue: 'Mostrando ate 50 faturas vencidas ou pendentes em atraso.',
    paid: 'Mostrando ate 50 faturas pagas mais recentes.',
    closed: 'Mostrando ate 50 faturas canceladas ou reembolsadas.',
  }

  return descriptions[filter]
}

export function getInternalInvoiceStatusLabel(
  invoice: Pick<InternalInvoiceForPolicy, 'status' | 'dueAt'>,
  now = new Date()
) {
  const tone = getInternalInvoiceStatusTone(invoice, now)

  if (tone === 'paid') return 'Paga'
  if (tone === 'overdue') return 'Vencida'
  if (tone === 'closed') {
    return invoice.status === 'refunded' ? 'Reembolsada' : 'Cancelada'
  }

  return 'Aberta'
}

export function matchesInternalInvoiceStatusFilter({
  invoice,
  filter,
  now = new Date(),
}: {
  invoice: Pick<InternalInvoiceForPolicy, 'status' | 'dueAt'>
  filter: InternalInvoiceStatusFilter
  now?: Date
}) {
  if (filter === 'all') return true

  return getInternalInvoiceStatusTone(invoice, now) === filter
}

export function getInternalInvoiceFinancialSummary(
  invoices: InternalInvoiceForPolicy[],
  now = new Date()
) {
  return invoices.reduce(
    (summary, invoice) => {
      const receivableAmount = getInternalInvoiceReceivableAmount(invoice)
      const tone = getInternalInvoiceStatusTone(invoice, now)

      summary.totalInvoices += 1
      summary.totalAmount += parseInternalDashboardAmount(invoice.totalAmount)
      summary.paidAmount += parseInternalDashboardAmount(invoice.amountPaid)

      if (tone === 'open' || tone === 'overdue') {
        summary.openInvoices += 1
        summary.openAmount += receivableAmount
      }

      if (tone === 'overdue') {
        summary.overdueInvoices += 1
        summary.overdueAmount += receivableAmount
      }

      if (tone === 'paid') {
        summary.paidInvoices += 1
      }

      if (tone === 'closed') {
        summary.closedInvoices += 1
      }

      return summary
    },
    {
      totalInvoices: 0,
      openInvoices: 0,
      overdueInvoices: 0,
      paidInvoices: 0,
      closedInvoices: 0,
      totalAmount: 0,
      openAmount: 0,
      overdueAmount: 0,
      paidAmount: 0,
    }
  )
}

export function canCopyInternalInvoicePaymentLink({
  invoice,
  canManageBillingInvoices,
  storeStatus,
  now = new Date(),
}: {
  invoice: Pick<InternalInvoiceForPolicy, 'status' | 'dueAt' | 'paymentLink'>
  canManageBillingInvoices: boolean
  storeStatus: string
  now?: Date
}) {
  const statusTone = getInternalInvoiceStatusTone(invoice, now)

  return (
    canManageBillingInvoices &&
    storeStatus !== 'archived' &&
    Boolean(invoice.paymentLink) &&
    (statusTone === 'open' || statusTone === 'overdue')
  )
}
