import { catalogCategoryProductsTable } from '@/services/db/schema/catalog-category-products'
import { categoriesTable } from '@/services/db/schema/categories'
import { categoryProductsTable } from '@/services/db/schema/category-products'
import { productsTable } from '@/services/db/schema/products'
import { relations } from 'drizzle-orm'

export const categoryProductsRelations = relations(categoryProductsTable, ({ one, many }) => ({
  category: one(categoriesTable, {
    fields: [categoryProductsTable.categoryId],
    references: [categoriesTable.id],
  }),
  product: one(productsTable, {
    fields: [categoryProductsTable.productId],
    references: [productsTable.id],
  }),
  catalogCategoryProducts: many(catalogCategoryProductsTable),
}))
