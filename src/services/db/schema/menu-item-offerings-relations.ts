import { itemOfferingsTable } from '@/services/db/schema/item-offerings'
import { menuItemOfferingsTable } from '@/services/db/schema/menu-item-offerings'
import { menusTable } from '@/services/db/schema/menus'
import { relations } from 'drizzle-orm'

export const menuItemOfferingsRelations = relations(menuItemOfferingsTable, ({ one }) => ({
  menu: one(menusTable, {
    fields: [menuItemOfferingsTable.menuId],
    references: [menusTable.id],
  }),
  itemOffering: one(itemOfferingsTable, {
    fields: [menuItemOfferingsTable.itemOfferingId],
    references: [itemOfferingsTable.id],
  }),
}))
