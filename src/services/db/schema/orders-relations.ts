import { orderItemsTable } from '@/services/db/schema/order-items'
import { ordersTable } from '@/services/db/schema/orders'
import { relations } from 'drizzle-orm'
import { orderPaymentsTable } from './order-payments'
import { orderAuditEventsTable } from './order-audit-events'

export const orderRelations = relations(ordersTable, ({ many }) => ({
  items: many(orderItemsTable),
  payments: many(orderPaymentsTable),
  auditEvents: many(orderAuditEventsTable),
}))

export const orderAuditEventRelations = relations(
  orderAuditEventsTable,
  ({ one }) => ({
    order: one(ordersTable, {
      fields: [orderAuditEventsTable.orderId, orderAuditEventsTable.storeId],
      references: [ordersTable.id, ordersTable.storeId],
    }),
  })
)
