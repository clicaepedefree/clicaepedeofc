import { catalogsTable } from '@/services/db/schema/catalogs'
import { storeCatalogsTable } from '@/services/db/schema/store-catalogs'
import { storesTable } from '@/services/db/schema/stores'
import { relations } from 'drizzle-orm'

export const storeCatalogsRelations = relations(storeCatalogsTable, ({ one }) => ({
  store: one(storesTable, {
    fields: [storeCatalogsTable.storeId],
    references: [storesTable.id],
  }),
  catalog: one(catalogsTable, {
    fields: [storeCatalogsTable.catalogId],
    references: [catalogsTable.id],
  }),
}))
