import { billingReminderRulesTable } from '@/services/db/schema/billing-reminder-rules'
import { storesTable } from '@/services/db/schema/stores'
import { storeBillingInvoicesTable } from '@/services/db/schema/store-billing-invoices'
import { storeSubscriptionsTable } from '@/services/db/schema/store-subscriptions'
import {
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

export const storeBillingReminderDeliveryChannels = [
  'email',
  'whatsapp',
  'system',
] as const

export const storeBillingReminderDeliveryStatuses = [
  'queued',
  'sent',
  'skipped',
  'failed',
] as const

export const storeBillingReminderDeliveriesTable = pgTable(
  'store_billing_reminder_deliveries',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    subscriptionId: integer('subscription_id').references(
      () => storeSubscriptionsTable.id,
      { onDelete: 'set null' }
    ),
    invoiceId: integer('invoice_id')
      .notNull()
      .references(() => storeBillingInvoicesTable.id, { onDelete: 'cascade' }),
    ruleId: integer('rule_id').references(() => billingReminderRulesTable.id, {
      onDelete: 'set null',
    }),
    channel: text('channel', {
      enum: storeBillingReminderDeliveryChannels,
    }).notNull(),
    daysAfterDue: integer('days_after_due').notNull(),
    status: text('status', {
      enum: storeBillingReminderDeliveryStatuses,
    })
      .notNull()
      .default('sent'),
    recipient: text('recipient'),
    title: text('title').notNull(),
    message: text('message').notNull(),
    dedupeKey: text('dedupe_key').notNull(),
    scheduledFor: baseTimestampColumnGenerator('scheduled_for').notNull(),
    sentAt: baseTimestampColumnGenerator('sent_at'),
    skippedAt: baseTimestampColumnGenerator('skipped_at'),
    failureReason: text('failure_reason'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
    updatedAt,
  },
  table => [
    unique('store_billing_reminder_deliveries_dedupe_unique').on(
      table.dedupeKey
    ),
    index('store_billing_reminder_deliveries_invoice_idx').on(
      table.invoiceId,
      table.createdAt
    ),
    index('store_billing_reminder_deliveries_store_status_idx').on(
      table.storeId,
      table.status
    ),
    index('store_billing_reminder_deliveries_scheduled_idx').on(
      table.scheduledFor
    ),
  ]
)

export type InsertStoreBillingReminderDelivery =
  typeof storeBillingReminderDeliveriesTable.$inferInsert
export type SelectStoreBillingReminderDelivery =
  typeof storeBillingReminderDeliveriesTable.$inferSelect

