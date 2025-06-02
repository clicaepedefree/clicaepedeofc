import { integer, numeric, pgTable, serial, text } from 'drizzle-orm/pg-core'
import { categoriesTable } from './categories'
import { ordersTable } from './orders'
import { productsTable } from './products'

export const orderItemsTable = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .notNull()
    .references(() => ordersTable.id),
  index: integer('index').notNull(),
  productId: integer('product_id')
    .notNull()
    .references(() => productsTable.id, { onDelete: 'no action' }),
  productName: text('product_name').notNull(),
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
