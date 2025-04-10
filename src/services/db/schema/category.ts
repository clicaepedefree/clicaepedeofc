import { pgTable, serial, text, integer, boolean } from 'drizzle-orm/pg-core'
import { createdAt, updatedAt } from './utils'

export const categoriesTable = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  index: integer('index').notNull(),
  status: text('status', { enum: ['AVAILABLE', 'UNAVAILABLE'] })
    .notNull()
    .default('AVAILABLE'),
  imagePath: text('image_path'),
  createdAt,
  updatedAt,
})

export type InsertCategory = typeof categoriesTable.$inferInsert
export type SelectCategory = typeof categoriesTable.$inferSelect
