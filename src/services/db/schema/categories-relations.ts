import { categoriesTable } from '@/services/db/schema/categories'
import { itemOfferingsTable } from '@/services/db/schema/item-offerings'
import { menuCategoriesTable } from '@/services/db/schema/menu-categories'
import { storeFilesTable } from '@/services/db/schema/store-files'
import { storesTable } from '@/services/db/schema/stores'
import { relations } from 'drizzle-orm'
import { itemsTable } from './items'

export const categoryRelations = relations(categoriesTable, ({ many, one }) => ({
  itemOfferings: many(itemOfferingsTable),
  items: many(itemsTable),
  store: one(storesTable, {
    fields: [categoriesTable.storeId],
    references: [storesTable.id],
  }),
  image: one(storeFilesTable, {
    fields: [categoriesTable.imageId],
    references: [storeFilesTable.id],
  }),
  menuCategories: many(menuCategoriesTable),
}))
