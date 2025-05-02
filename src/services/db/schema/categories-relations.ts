import { relations } from 'drizzle-orm'
import { categoriesTable } from './categories'
import { categoryProductsTable } from './category-products'
import { storesTable } from './stores'
import { catalogCategoriesTable } from './catalog-categories'
import { storeFilesTable } from './store-files'

export const categoryRelations = relations(categoriesTable, ({ many, one }) => ({
  products: many(categoryProductsTable),
  store: one(storesTable, {
    fields: [categoriesTable.storeId],
    references: [storesTable.id],
  }),
  image: one(storeFilesTable, {
    fields: [categoriesTable.imageId],
    references: [storeFilesTable.id],
  }),
  catalogCategories: many(catalogCategoriesTable),
}))
