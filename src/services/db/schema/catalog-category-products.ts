import { pgTable, serial, integer, boolean, text } from 'drizzle-orm/pg-core'
import { createdAt, updatedAt } from './utils'
import { catalogsTable } from './catalogs'
import { categoryProductsTable } from './category-products'

export const catalogCategoryProductsTable = pgTable('catalog_category_products', {
  id: serial('id').primaryKey(),
  categoryProductId: integer('category_product_id')
    .notNull()
    .references(() => categoryProductsTable.id, { onDelete: 'cascade' }),
  catalogId: integer('catalog_id')
    .notNull()
    .references(() => catalogsTable.id, { onDelete: 'cascade' }),
  index: integer('index'),
  isAvailable: boolean('is_available'),
  price: integer('price'),
  originalPrice: integer('original_price'),
  externalCode: text('external_code'),
  createdAt,
  updatedAt,
})

export type InsertCatalogCategoryProduct = typeof catalogCategoryProductsTable.$inferInsert
export type SelectCatalogCategoryProduct = typeof catalogCategoryProductsTable.$inferSelect
