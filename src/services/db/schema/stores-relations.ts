import { relations } from 'drizzle-orm'
import { storesTable } from './stores'
import { storeCatalogsTable } from './store-catalogs'
import { storeConfigurationsTable } from './store-configurations'
import { categoriesTable } from './categories'
import { storeFilesTable } from './store-files'

export const storeRelations = relations(storesTable, ({ many }) => ({
  catalogs: many(storeCatalogsTable),
  categories: many(categoriesTable),
  configurations: many(storeConfigurationsTable),
  files: many(storeFilesTable),
}))
