import { ordersTable } from '@/services/db/schema/orders'
import { serviceInvoicesTable } from '@/services/db/schema/service-invoices'
import { storesTable } from '@/services/db/schema/stores'
import { relations } from 'drizzle-orm'

export const serviceInvoicesRelations = relations(serviceInvoicesTable, ({ one }) => ({
  store: one(storesTable, {
    fields: [serviceInvoicesTable.storeId],
    references: [storesTable.id],
  }),
  order: one(ordersTable, {
    fields: [serviceInvoicesTable.orderId],
    references: [ordersTable.id],
  }),
}))
