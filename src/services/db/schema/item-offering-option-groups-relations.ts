import { itemOfferingOptionGroupsTable } from '@/services/db/schema/item-offering-option-groups'
import { itemOfferingsTable } from '@/services/db/schema/item-offerings'
import { optionGroupsTable } from '@/services/db/schema/option-groups'
import { relations } from 'drizzle-orm'

export const itemOfferingOptionGroupsRelations = relations(
  itemOfferingOptionGroupsTable,
  ({ one }) => ({
    itemOffering: one(itemOfferingsTable, {
      fields: [itemOfferingOptionGroupsTable.itemOfferingId],
      references: [itemOfferingsTable.id],
    }),
    optionGroup: one(optionGroupsTable, {
      fields: [itemOfferingOptionGroupsTable.optionGroupId],
      references: [optionGroupsTable.id],
    }),
  })
)
