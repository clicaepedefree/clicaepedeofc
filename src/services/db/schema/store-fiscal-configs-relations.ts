import { storeFiscalConfigsTable } from '@/services/db/schema/store-fiscal-configs'
import { storesTable } from '@/services/db/schema/stores'
import { relations } from 'drizzle-orm'

export const storeFiscalConfigsRelations = relations(storeFiscalConfigsTable, ({ one }) => ({
  store: one(storesTable, {
    fields: [storeFiscalConfigsTable.storeId],
    references: [storesTable.id],
  }),
}))
