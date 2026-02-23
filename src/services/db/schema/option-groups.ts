import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core'

export const optionGroupsTable = pgTable('option_groups', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id),
  name: text('name').notNull(),
  minQuantity: integer('min_quantity').notNull().default(0),
  maxQuantity: integer('max_quantity').notNull().default(1),
  createdAt,
  updatedAt,
})

export type InsertOptionGroup = Omit<
  typeof optionGroupsTable.$inferInsert,
  'createdAt' | 'updatedAt'
>
export type SelectOptionGroup = typeof optionGroupsTable.$inferSelect
