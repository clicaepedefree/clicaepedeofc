import { ordersTable } from '@/services/db/schema/orders'
import { relations } from 'drizzle-orm'
import { orderPaymentsTable } from './order-payments'

export const orderPaymentsRelations = relations(orderPaymentsTable, ({ one }) => ({
  order: one(ordersTable, {
    fields: [orderPaymentsTable.orderId],
    references: [ordersTable.id],
  }),
}))
