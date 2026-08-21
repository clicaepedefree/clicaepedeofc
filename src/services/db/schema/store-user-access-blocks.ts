import {
  baseTimestampColumnGenerator,
  createdAt,
  updatedAt,
} from '@/services/db/schema/utils'
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { storesTable } from './stores'
import { usersTable } from './users'

export const storeUserAccessBlockNotificationChannels = [
  'none',
  'email',
  'whatsapp',
  'manual',
] as const

export const storeUserAccessBlocksTable = pgTable(
  'store_user_access_blocks',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    notificationChannel: text('notification_channel', {
      enum: storeUserAccessBlockNotificationChannels,
    })
      .notNull()
      .default('none'),
    notificationNote: text('notification_note'),
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
    index('store_user_access_blocks_store_user_idx').on(
      table.storeId,
      table.userId,
      table.blockedAt
    ),
    index('store_user_access_blocks_user_idx').on(table.userId),
    uniqueIndex('store_user_access_blocks_one_active_idx')
      .on(table.storeId, table.userId)
      .where(sql`${table.unblockedAt} is null`),
  ]
)

export type InsertStoreUserAccessBlock =
  typeof storeUserAccessBlocksTable.$inferInsert
export type SelectStoreUserAccessBlock =
  typeof storeUserAccessBlocksTable.$inferSelect
