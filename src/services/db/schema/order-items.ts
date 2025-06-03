import { integer, numeric, pgTable, serial, text } from 'drizzle-orm/pg-core'
import { categoriesTable } from './categories'
import { itemsTable } from './items'
import { ordersTable } from './orders'

export const orderItemsTable = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .notNull()
    .references(() => ordersTable.id),
  index: integer('index').notNull(),
  itemId: integer('item_id')
    .notNull()
    .references(() => itemsTable.id, { onDelete: 'no action' }),
  itemName: text('item_name').notNull(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => categoriesTable.id, { onDelete: 'no action' }),
  categoryName: text('category_name').notNull(),
  price: numeric('price', { precision: 19, scale: 4 }).notNull(),
  originalPrice: numeric('original_price', { precision: 19, scale: 4 }),
  quantity: numeric('quantity', { precision: 19, scale: 4 }).notNull(),
  externalCode: text('external_code'),
  ean: text('ean'),
})

export type InsertOrderItem = typeof orderItemsTable.$inferInsert
export type SelectOrderItem = typeof orderItemsTable.$inferSelect
