import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { pgTable, serial, text } from 'drizzle-orm/pg-core'

export const configurationsTable = pgTable('configurations', {
  id: serial('id').primaryKey(),
  category: text('category').notNull(),
  name: text('name').notNull(),
  default: text('default'),
  type: text('type').notNull().default('switch'),
  createdAt,
  updatedAt,
})

export type InsertConfiguration = typeof configurationsTable.$inferInsert
export type SelectConfiguration = typeof configurationsTable.$inferSelect
