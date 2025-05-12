import { storeFilesTable } from '@/services/db/schema/store-files'
import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { boolean, integer, pgTable, serial, text } from 'drizzle-orm/pg-core'

export const categoriesTable = pgTable('categories', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id),
  name: text('name').notNull(),
  description: text('description'),
  index: integer('index').notNull(),
  isAvailable: boolean('is_available').notNull().default(true),
  imageId: integer('image_id').references(() => storeFilesTable.id),
  createdAt,
  updatedAt,
})

export type InsertCategory = Omit<typeof categoriesTable.$inferInsert, 'createdAt' | 'updatedAt'>
export type SelectCategory = typeof categoriesTable.$inferSelect
