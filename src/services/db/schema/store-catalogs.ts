import { pgTable, integer, boolean } from 'drizzle-orm/pg-core'
import { storesTable } from './stores'
import { catalogsTable } from './catalogs'
import { createdAt, updatedAt } from './utils'

export const storeCatalogsTable = pgTable('store_catalogs', {
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id, { onDelete: 'cascade' }),
  catalogId: integer('catalog_id')
    .notNull()
    .references(() => catalogsTable.id, { onDelete: 'cascade' }),
  isAvailable: boolean('is_available').notNull().default(false),
  createdAt,
  updatedAt,
})

export type InsertStoreCatalog = typeof storeCatalogsTable.$inferInsert
export type SelectStoreCatalog = typeof storeCatalogsTable.$inferSelect
