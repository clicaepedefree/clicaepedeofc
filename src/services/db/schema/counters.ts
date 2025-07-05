import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core'

export const countersTable = pgTable('counters', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt,
  updatedAt,
})

export type InsertCounter = Omit<
  typeof countersTable.$inferInsert,
  'createdAt' | 'updatedAt'
>
export type SelectCounter = typeof countersTable.$inferSelect
