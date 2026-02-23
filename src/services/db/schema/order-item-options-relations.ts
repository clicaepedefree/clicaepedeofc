import { relations } from 'drizzle-orm'
import { orderItemOptionsTable } from './order-item-options'
import { orderItemsTable } from './order-items'

export const orderItemOptionsRelations = relations(orderItemOptionsTable, ({ one }) => ({
  orderItem: one(orderItemsTable, {
    fields: [orderItemOptionsTable.orderItemId],
    references: [orderItemsTable.id],
  }),
}))
