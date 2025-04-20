import { relations } from 'drizzle-orm'
import { storeCatalogsTable } from './store-catalogs'
import { storesTable } from './stores'
import { catalogsTable } from './catalogs'

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
