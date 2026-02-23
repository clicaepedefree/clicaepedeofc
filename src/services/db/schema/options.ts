import { itemsTable } from '@/services/db/schema/items'
import { optionGroupsTable } from '@/services/db/schema/option-groups'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { integer, numeric, pgTable, serial } from 'drizzle-orm/pg-core'

export const optionsTable = pgTable('options', {
  id: serial('id').primaryKey(),
  optionGroupId: integer('option_group_id')
    .notNull()
    .references(() => optionGroupsTable.id, { onDelete: 'cascade' }),
  itemId: integer('item_id')
    .notNull()
    .references(() => itemsTable.id, { onDelete: 'no action' }),
  price: numeric('price', { precision: 19, scale: 4 }).notNull().default('0'),
  originalPrice: numeric('original_price', { precision: 19, scale: 4 }),
  minQuantity: integer('min_quantity').notNull().default(0),
  maxQuantity: integer('max_quantity').notNull().default(1),
  index: integer('index').notNull(),
  createdAt,
  updatedAt,
})

export type InsertOption = Omit<
  typeof optionsTable.$inferInsert,
  'createdAt' | 'updatedAt'
>
export type SelectOption = typeof optionsTable.$inferSelect
