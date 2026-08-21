import { storesTable } from '@/services/db/schema/stores'
import { storeBillingInvoicesTable } from '@/services/db/schema/store-billing-invoices'
import { storeBillingPaymentsTable } from '@/services/db/schema/store-billing-payments'
import { storeSubscriptionsTable } from '@/services/db/schema/store-subscriptions'
import { createdAt } from '@/services/db/schema/utils'
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
} from 'drizzle-orm/pg-core'

export const storeBillingEventTypes = [
  'subscription_created',
  'subscription_changed',
  'subscription_cancelled',
  'invoice_created',
  'invoice_status_changed',
  'payment_registered',
  'payment_confirmed',
  'payment_failed',
  'refund_registered',
  'billing_adjustment_created',
  'billing_reminder_sent',
] as const

export const storeBillingEventsTable = pgTable(
  'store_billing_events',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    subscriptionId: integer('subscription_id').references(
      () => storeSubscriptionsTable.id,
      { onDelete: 'set null' }
    ),
    invoiceId: integer('invoice_id').references(
      () => storeBillingInvoicesTable.id,
      { onDelete: 'set null' }
    ),
    paymentId: integer('payment_id').references(
      () => storeBillingPaymentsTable.id,
      { onDelete: 'set null' }
    ),
    eventType: text('event_type', { enum: storeBillingEventTypes }).notNull(),
    actorClerkId: text('actor_clerk_id'),
    actorEmail: text('actor_email'),
    reason: text('reason'),
    previousValues: jsonb('previous_values'),
    newValues: jsonb('new_values'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
  },
  table => [
    index('store_billing_events_store_created_idx').on(
      table.storeId,
      table.createdAt
    ),
    index('store_billing_events_subscription_idx').on(table.subscriptionId),
    index('store_billing_events_invoice_idx').on(table.invoiceId),
  ]
)

export type InsertStoreBillingEvent =
  typeof storeBillingEventsTable.$inferInsert
export type SelectStoreBillingEvent =
  typeof storeBillingEventsTable.$inferSelect
