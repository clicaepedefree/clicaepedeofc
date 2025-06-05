import { orderItemsTable } from '@/services/db/schema/order-items'
import { ordersTable } from '@/services/db/schema/orders'
import { relations } from 'drizzle-orm'
import { orderPaymentsTable } from './order-payments'

export const orderRelations = relations(ordersTable, ({ many }) => ({
  items: many(orderItemsTable),
  payments: many(orderPaymentsTable),
}))
