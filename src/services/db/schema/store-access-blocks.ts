import { storesTable } from '@/services/db/schema/stores'
import { storeBillingInvoicesTable } from '@/services/db/schema/store-billing-invoices'
import { storeSubscriptionsTable } from '@/services/db/schema/store-subscriptions'
import {
  baseTimestampColumnGenerator,
  createdAt,
  updatedAt,
} from '@/services/db/schema/utils'
import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const storeAccessBlockSources = [
  'manual',
  'billing_delinquency',
] as const

export const storeAccessBlockReasonCodes = [
  'invoice_overdue_after_grace',
] as const

export const storeAccessBlocksTable = pgTable(
  'store_access_blocks',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    source: text('source', { enum: storeAccessBlockSources })
      .notNull()
      .default('manual'),
    reasonCode: text('reason_code', { enum: storeAccessBlockReasonCodes }),
    subscriptionId: integer('subscription_id').references(
      () => storeSubscriptionsTable.id,
      { onDelete: 'set null' }
    ),
    invoiceId: integer('invoice_id').references(
      () => storeBillingInvoicesTable.id,
      { onDelete: 'set null' }
    ),
    dedupeKey: text('dedupe_key'),
    reason: text('reason').notNull(),
    notifyStoreOwner: boolean('notify_store_owner').notNull().default(false),
    notificationNote: text('notification_note'),
    scheduledUnblockAt: baseTimestampColumnGenerator('scheduled_unblock_at'),
    blockedAt: baseTimestampColumnGenerator('blocked_at')
      .notNull()
      .defaultNow(),
    blockedByClerkId: text('blocked_by_clerk_id').notNull(),
    blockedByEmail: text('blocked_by_email').notNull(),
    blockedByName: text('blocked_by_name'),
    unblockedAt: baseTimestampColumnGenerator('unblocked_at'),
    unblockedByClerkId: text('unblocked_by_clerk_id'),
    unblockedByEmail: text('unblocked_by_email'),
    unblockedByName: text('unblocked_by_name'),
    unblockReason: text('unblock_reason'),
    createdAt,
    updatedAt,
  },
  table => [
    index('store_access_blocks_store_blocked_idx').on(
      table.storeId,
      table.blockedAt
    ),
    index('store_access_blocks_scheduled_unblock_idx').on(
      table.scheduledUnblockAt
    ),
    index('store_access_blocks_invoice_idx').on(table.invoiceId),
    uniqueIndex('store_access_blocks_dedupe_key_unique')
      .on(table.dedupeKey)
      .where(sql`${table.dedupeKey} is not null`),
  ]
)

export type InsertStoreAccessBlock = typeof storeAccessBlocksTable.$inferInsert
export type SelectStoreAccessBlock = typeof storeAccessBlocksTable.$inferSelect
