import { catalogCategoriesTable } from '@/services/db/schema/catalog-categories'
import { categoriesTable } from '@/services/db/schema/categories'
import { categoryProductsTable } from '@/services/db/schema/category-products'
import { storeFilesTable } from '@/services/db/schema/store-files'
import { storesTable } from '@/services/db/schema/stores'
import { relations } from 'drizzle-orm'

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
