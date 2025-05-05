import { catalogsTable } from '@/services/db/schema/catalogs'
import { categoriesTable } from '@/services/db/schema/categories'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { boolean, integer, pgTable, serial, text } from 'drizzle-orm/pg-core'

export const catalogCategoriesTable = pgTable('catalog_categories', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => categoriesTable.id, { onDelete: 'cascade' }),
  catalogId: integer('catalog_id')
    .notNull()
    .references(() => catalogsTable.id, { onDelete: 'cascade' }),
  index: integer('index'),
  isAvailable: boolean('is_available'),
  createdAt,
  updatedAt,
})

export type InsertCatalogCategoryProduct = typeof catalogCategoriesTable.$inferInsert
export type SelectCatalogCategoryProduct = typeof catalogCategoriesTable.$inferSelect
