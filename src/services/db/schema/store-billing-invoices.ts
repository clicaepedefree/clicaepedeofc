import { billingPlansTable } from '@/services/db/schema/billing-plans'
import { storesTable } from '@/services/db/schema/stores'
import { storeSubscriptionsTable } from '@/services/db/schema/store-subscriptions'
import {
  baseCurrencyColumnGenerator,
  baseTimestampColumnGenerator,
  createdAt,
  updatedAt,
} from '@/services/db/schema/utils'
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  unique,
} from 'drizzle-orm/pg-core'

export const storeBillingInvoiceStatuses = [
  'pending',
  'paid',
  'overdue',
  'cancelled',
  'refunded',
] as const

export const storeBillingInvoicesTable = pgTable(
  'store_billing_invoices',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    subscriptionId: integer('subscription_id')
      .notNull()
      .references(() => storeSubscriptionsTable.id, { onDelete: 'no action' }),
    planId: integer('plan_id').references(() => billingPlansTable.id, {
      onDelete: 'no action',
    }),
    invoiceNumber: text('invoice_number').notNull(),
    status: text('status', { enum: storeBillingInvoiceStatuses })
      .notNull()
      .default('pending'),
    currency: text('currency').notNull().default('BRL'),
    subtotalAmount: baseCurrencyColumnGenerator('subtotal_amount').notNull(),
    discountAmount: baseCurrencyColumnGenerator('discount_amount')
      .notNull()
      .default('0'),
    totalAmount: baseCurrencyColumnGenerator('total_amount').notNull(),
    amountPaid: baseCurrencyColumnGenerator('amount_paid')
      .notNull()
      .default('0'),
    amountRefunded: baseCurrencyColumnGenerator('amount_refunded')
      .notNull()
      .default('0'),
    planSnapshot: jsonb('plan_snapshot').notNull(),
    contractSnapshot: jsonb('contract_snapshot').notNull(),
    periodStart: baseTimestampColumnGenerator('period_start').notNull(),
    periodEnd: baseTimestampColumnGenerator('period_end').notNull(),
    dueAt: baseTimestampColumnGenerator('due_at').notNull(),
    paidAt: baseTimestampColumnGenerator('paid_at'),
    cancelledAt: baseTimestampColumnGenerator('cancelled_at'),
    refundedAt: baseTimestampColumnGenerator('refunded_at'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
    updatedAt,
  },
  table => [
    unique('store_billing_invoices_invoice_number_unique').on(
      table.invoiceNumber
    ),
    index('store_billing_invoices_store_status_idx').on(
      table.storeId,
      table.status
    ),
    index('store_billing_invoices_due_at_idx').on(table.dueAt),
  ]
)

export type InsertStoreBillingInvoice =
  typeof storeBillingInvoicesTable.$inferInsert
export type SelectStoreBillingInvoice =
  typeof storeBillingInvoicesTable.$inferSelect
