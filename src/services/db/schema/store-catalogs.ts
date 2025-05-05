import { catalogsTable } from '@/services/db/schema/catalogs'
import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { boolean, integer, pgTable } from 'drizzle-orm/pg-core'

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
