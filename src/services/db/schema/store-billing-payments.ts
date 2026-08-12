import { storesTable } from '@/services/db/schema/stores'
import { storeBillingInvoicesTable } from '@/services/db/schema/store-billing-invoices'
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
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const storeBillingPaymentStatuses = [
  'pending',
  'confirmed',
  'failed',
  'cancelled',
  'refunded',
] as const

export const storeBillingPaymentMethods = [
  'pix',
  'credit_card',
  'boleto',
  'manual',
  'external',
] as const

export const storeBillingPaymentsTable = pgTable(
  'store_billing_payments',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    invoiceId: integer('invoice_id')
      .notNull()
      .references(() => storeBillingInvoicesTable.id, {
        onDelete: 'no action',
      }),
    status: text('status', { enum: storeBillingPaymentStatuses })
      .notNull()
      .default('pending'),
    method: text('method', { enum: storeBillingPaymentMethods }).notNull(),
    amount: baseCurrencyColumnGenerator('amount').notNull(),
    currency: text('currency').notNull().default('BRL'),
    provider: text('provider'),
    providerPaymentId: text('provider_payment_id'),
    paidAt: baseTimestampColumnGenerator('paid_at'),
    failedAt: baseTimestampColumnGenerator('failed_at'),
    refundedAt: baseTimestampColumnGenerator('refunded_at'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
    updatedAt,
  },
  table => [
    uniqueIndex('store_billing_payments_provider_payment_unique')
      .on(table.provider, table.providerPaymentId)
      .where(sql`${table.providerPaymentId} is not null`),
    index('store_billing_payments_invoice_status_idx').on(
      table.invoiceId,
      table.status
    ),
    index('store_billing_payments_store_status_idx').on(
      table.storeId,
      table.status
    ),
  ]
)

export type InsertStoreBillingPayment =
  typeof storeBillingPaymentsTable.$inferInsert
export type SelectStoreBillingPayment =
  typeof storeBillingPaymentsTable.$inferSelect
