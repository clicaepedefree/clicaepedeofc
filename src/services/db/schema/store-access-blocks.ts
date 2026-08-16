import { storesTable } from '@/services/db/schema/stores'
import {
  baseTimestampColumnGenerator,
  createdAt,
  updatedAt,
} from '@/services/db/schema/utils'
import { boolean, index, integer, pgTable, serial, text } from 'drizzle-orm/pg-core'

export const storeAccessBlocksTable = pgTable(
  'store_access_blocks',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    notifyStoreOwner: boolean('notify_store_owner').notNull().default(false),
    notificationNote: text('notification_note'),
    scheduledUnblockAt: baseTimestampColumnGenerator('scheduled_unblock_at'),
    blockedAt: baseTimestampColumnGenerator('blocked_at').notNull().defaultNow(),
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
  ]
)

export type InsertStoreAccessBlock =
  typeof storeAccessBlocksTable.$inferInsert
export type SelectStoreAccessBlock =
  typeof storeAccessBlocksTable.$inferSelect
