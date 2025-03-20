import { pgTable, serial, text } from 'drizzle-orm/pg-core'
import { createdAt, updatedAt } from './utils'

export const storesTable = pgTable('stores', {
  id: serial('id').primaryKey(),
  subdomain: text('subdomain').unique().notNull(),
  name: text('name').notNull(),
  createdAt,
  updatedAt,
})

export type InsertStore = typeof storesTable.$inferInsert
export type SelectStore = typeof storesTable.$inferSelect
