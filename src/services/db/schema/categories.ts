import { pgTable, serial, text, integer, boolean } from 'drizzle-orm/pg-core'
import { createdAt, updatedAt } from './utils'
import { storesTable } from './stores'

export const categoriesTable = pgTable('categories', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id),
  name: text('name').notNull(),
  description: text('description'),
  index: integer('index').notNull(),
  isAvailable: boolean('is_available').notNull().default(true),
  imagePath: text('image_path'),
  createdAt,
  updatedAt,
})

export type InsertCategory = typeof categoriesTable.$inferInsert
export type SelectCategory = typeof categoriesTable.$inferSelect
