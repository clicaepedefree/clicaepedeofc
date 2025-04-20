import { relations } from 'drizzle-orm'
import { productsTable } from './products'
import { categoryProductsTable } from './category-products'
import { storesTable } from './stores'

export const productRelations = relations(productsTable, ({ many, one }) => ({
  categories: many(categoryProductsTable),
  store: one(storesTable, {
    fields: [productsTable.storeId],
    references: [storesTable.id],
  }),
}))
