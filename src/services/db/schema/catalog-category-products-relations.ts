import { catalogCategoryProductsTable } from '@/services/db/schema/catalog-category-products'
import { catalogsTable } from '@/services/db/schema/catalogs'
import { categoryProductsTable } from '@/services/db/schema/category-products'
import { relations } from 'drizzle-orm'

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
