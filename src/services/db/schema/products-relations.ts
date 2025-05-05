import { categoryProductsTable } from '@/services/db/schema/category-products'
import { productsTable } from '@/services/db/schema/products'
import { storesTable } from '@/services/db/schema/stores'
import { relations } from 'drizzle-orm'

export const productRelations = relations(productsTable, ({ many, one }) => ({
  categories: many(categoryProductsTable),
  store: one(storesTable, {
    fields: [productsTable.storeId],
    references: [storesTable.id],
  }),
}))
