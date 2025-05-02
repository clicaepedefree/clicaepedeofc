import { pgTable, serial, text, integer, boolean } from 'drizzle-orm/pg-core'
import { createdAt, updatedAt } from './utils'
import { storesTable } from './stores'
import { storeFilesTable } from './store-files'

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

export type InsertCategory = Omit<typeof categoriesTable.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>
export type SelectCategory = typeof categoriesTable.$inferSelect
