import { pgTable, serial, integer, boolean, text } from 'drizzle-orm/pg-core'
import { createdAt, updatedAt } from './utils'
import { catalogsTable } from './catalogs'
import { categoriesTable } from './categories'

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
