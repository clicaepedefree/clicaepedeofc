import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core'

export const storeFilesTable = pgTable('store_files', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id, { onDelete: 'cascade' }),
  creatorId: text('creator_id').notNull(),
  provider: text('provider').notNull(),
  type: text('type').notNull(),
  url: text('url').notNull(),
  tag: text('tag'),
  createdAt,
  updatedAt,
})

export type InsertStoreFile = typeof storeFilesTable.$inferInsert
export type SelectStoreFile = typeof storeFilesTable.$inferSelect
