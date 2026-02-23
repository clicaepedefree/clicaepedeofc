import { itemsTable } from '@/services/db/schema/items'
import { optionGroupsTable } from '@/services/db/schema/option-groups'
import { optionsTable } from '@/services/db/schema/options'
import { relations } from 'drizzle-orm'

export const optionsRelations = relations(optionsTable, ({ one }) => ({
  optionGroup: one(optionGroupsTable, {
    fields: [optionsTable.optionGroupId],
    references: [optionGroupsTable.id],
  }),
  item: one(itemsTable, {
    fields: [optionsTable.itemId],
    references: [itemsTable.id],
  }),
}))
