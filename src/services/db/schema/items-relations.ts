import { itemOfferingsTable } from '@/services/db/schema/item-offerings'
import { itemsTable } from '@/services/db/schema/items'
import { storesTable } from '@/services/db/schema/stores'
import { relations } from 'drizzle-orm'
import { storeFilesTable } from './store-files'

export const itemRelations = relations(itemsTable, ({ many, one }) => ({
  offerings: many(itemOfferingsTable),
  store: one(storesTable, {
    fields: [itemsTable.storeId],
    references: [storesTable.id],
  }),
  image: one(storeFilesTable, {
    fields: [itemsTable.imageId],
    references: [storeFilesTable.id],
  }),
}))
