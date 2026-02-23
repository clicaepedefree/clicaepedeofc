import { itemOfferingOptionGroupsTable } from '@/services/db/schema/item-offering-option-groups'
import { optionGroupsTable } from '@/services/db/schema/option-groups'
import { optionsTable } from '@/services/db/schema/options'
import { storesTable } from '@/services/db/schema/stores'
import { relations } from 'drizzle-orm'

export const optionGroupsRelations = relations(optionGroupsTable, ({ many, one }) => ({
  options: many(optionsTable),
  itemOfferingOptionGroups: many(itemOfferingOptionGroupsTable),
  store: one(storesTable, {
    fields: [optionGroupsTable.storeId],
    references: [storesTable.id],
  }),
}))
