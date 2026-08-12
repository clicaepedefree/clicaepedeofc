import { categoriesTable } from '@/services/db/schema/categories'
import { countersTable } from '@/services/db/schema/counters'
import { storeAddressesTable } from '@/services/db/schema/store-addresses'
import { storeConfigurationsTable } from '@/services/db/schema/store-configurations'
import { storeFilesTable } from '@/services/db/schema/store-files'
import { storeMenusTable } from '@/services/db/schema/store-menus'
import { storesTable } from '@/services/db/schema/stores'
import { relations } from 'drizzle-orm'

export const storeRelations = relations(storesTable, ({ many }) => ({
  menus: many(storeMenusTable),
  categories: many(categoriesTable),
  configurations: many(storeConfigurationsTable),
  files: many(storeFilesTable),
  counters: many(countersTable),
  addresses: many(storeAddressesTable),
}))
