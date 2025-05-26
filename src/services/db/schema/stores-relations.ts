import { categoriesTable } from '@/services/db/schema/categories'
import { storeCatalogsTable } from '@/services/db/schema/store-catalogs'
import { storeConfigurationsTable } from '@/services/db/schema/store-configurations'
import { storeFilesTable } from '@/services/db/schema/store-files'
import { storesTable } from '@/services/db/schema/stores'
import { relations } from 'drizzle-orm'
import { cashiersTable } from './cashiers'

export const storeRelations = relations(storesTable, ({ many }) => ({
  catalogs: many(storeCatalogsTable),
  categories: many(categoriesTable),
  configurations: many(storeConfigurationsTable),
  files: many(storeFilesTable),
  cashiers: many(cashiersTable),
}))
