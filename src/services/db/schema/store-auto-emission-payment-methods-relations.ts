import { storeAutoEmissionPaymentMethodsTable } from '@/services/db/schema/store-auto-emission-payment-methods'
import { storesTable } from '@/services/db/schema/stores'
import { relations } from 'drizzle-orm'

export const storeAutoEmissionPaymentMethodsRelations = relations(
  storeAutoEmissionPaymentMethodsTable,
  ({ one }) => ({
    store: one(storesTable, {
      fields: [storeAutoEmissionPaymentMethodsTable.storeId],
      references: [storesTable.id],
    }),
  })
)
