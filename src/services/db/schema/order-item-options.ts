import { integer, numeric, pgTable, serial, text } from 'drizzle-orm/pg-core'
import { orderItemsTable } from './order-items'

export const orderItemOptionsTable = pgTable('order_item_options', {
  id: serial('id').primaryKey(),
  orderItemId: integer('order_item_id')
    .notNull()
    .references(() => orderItemsTable.id, { onDelete: 'cascade' }),
  optionGroupName: text('option_group_name').notNull(),
  optionName: text('option_name').notNull(),
  price: numeric('price', { precision: 19, scale: 4 }).notNull(),
  quantity: numeric('quantity', { precision: 19, scale: 4 }).notNull(),
  index: integer('index').notNull(),
})

export type InsertOrderItemOption = typeof orderItemOptionsTable.$inferInsert
export type SelectOrderItemOption = typeof orderItemOptionsTable.$inferSelect
