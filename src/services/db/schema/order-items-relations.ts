import { relations } from 'drizzle-orm'
import { categoriesTable } from './categories'
import { orderItemsTable } from './order-items'
import { ordersTable } from './orders'
import { productsTable } from './products'

export const orderItemsRelations = relations(orderItemsTable, ({ one }) => ({
  order: one(ordersTable, {
    fields: [orderItemsTable.orderId],
    references: [ordersTable.id],
  }),
  product: one(productsTable, {
    fields: [orderItemsTable.productId],
    references: [productsTable.id],
  }),
  category: one(categoriesTable, {
    fields: [orderItemsTable.categoryId],
    references: [categoriesTable.id],
  }),
}))
