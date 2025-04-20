import { relations } from 'drizzle-orm'
import { catalogCategoryProductsTable } from './catalog-category-products'
import { catalogsTable } from './catalogs'
import { categoryProductsTable } from './category-products'

export const catalogCategoryProductsRelations = relations(catalogCategoryProductsTable, ({ one }) => ({
  catalog: one(catalogsTable, {
    fields: [catalogCategoryProductsTable.catalogId],
    references: [catalogsTable.id],
  }),
  categoryProduct: one(categoryProductsTable, {
    fields: [catalogCategoryProductsTable.categoryProductId],
    references: [categoryProductsTable.id],
  }),
}))
