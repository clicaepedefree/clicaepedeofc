import { menuCategoriesTable } from '@/services/db/schema/menu-categories'
import { menuItemOfferingsTable } from '@/services/db/schema/menu-item-offerings'
import { menusTable } from '@/services/db/schema/menus'
import { storeMenusTable } from '@/services/db/schema/store-menus'
import { relations } from 'drizzle-orm'

export const menusRelations = relations(menusTable, ({ many }) => ({
  storeMenus: many(storeMenusTable),
  menuCategories: many(menuCategoriesTable),
  menuItemOfferings: many(menuItemOfferingsTable),
}))
