import { relations } from 'drizzle-orm'
import { categoriesTable } from './categories'
import { itemsTable } from './items'
import { orderItemOptionsTable } from './order-item-options'
import { orderItemsTable } from './order-items'
import { ordersTable } from './orders'

export const orderItemsRelations = relations(orderItemsTable, ({ one, many }) => ({
  order: one(ordersTable, {
    fields: [orderItemsTable.orderId],
    references: [ordersTable.id],
  }),
  item: one(itemsTable, {
    fields: [orderItemsTable.itemId],
    references: [itemsTable.id],
  }),
  category: one(categoriesTable, {
    fields: [orderItemsTable.categoryId],
    references: [categoriesTable.id],
  }),
  options: many(orderItemOptionsTable),
}))
