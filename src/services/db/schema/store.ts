import { sql } from 'drizzle-orm'
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const storesTable = pgTable('stores', {
  id: serial('id').primaryKey(),
  subdomain: text('subdomain').unique().notNull(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: timestamp('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull()
    .$onUpdate(() => sql`CURRENT_TIMESTAMP`),
})

export type InsertStore = typeof storesTable.$inferInsert
export type SelectStore = typeof storesTable.$inferSelect
