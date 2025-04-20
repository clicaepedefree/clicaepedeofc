import { relations } from 'drizzle-orm'
import { categoryProductsTable } from './category-products'
import { categoriesTable } from './categories'
import { productsTable } from './products'
import { catalogCategoryProductsTable } from './catalog-category-products'

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
