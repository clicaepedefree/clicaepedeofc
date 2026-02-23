import { categoriesTable } from '@/services/db/schema/categories'
import { itemOfferingOptionGroupsTable } from '@/services/db/schema/item-offering-option-groups'
import { itemOfferingsTable } from '@/services/db/schema/item-offerings'
import { itemsTable } from '@/services/db/schema/items'
import { menuItemOfferingsTable } from '@/services/db/schema/menu-item-offerings'
import { relations } from 'drizzle-orm'

export const itemOfferingsRelations = relations(itemOfferingsTable, ({ one, many }) => ({
  category: one(categoriesTable, {
    fields: [itemOfferingsTable.categoryId],
    references: [categoriesTable.id],
  }),
  item: one(itemsTable, {
    fields: [itemOfferingsTable.itemId],
    references: [itemsTable.id],
  }),
  menuItemOfferings: many(menuItemOfferingsTable),
  itemOfferingOptionGroups: many(itemOfferingOptionGroupsTable),
}))
