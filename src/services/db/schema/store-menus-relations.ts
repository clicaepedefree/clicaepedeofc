import { menusTable } from '@/services/db/schema/menus'
import { storeMenusTable } from '@/services/db/schema/store-menus'
import { storesTable } from '@/services/db/schema/stores'
import { relations } from 'drizzle-orm'

export const storeMenusRelations = relations(storeMenusTable, ({ one }) => ({
  store: one(storesTable, {
    fields: [storeMenusTable.storeId],
    references: [storesTable.id],
  }),
  menu: one(menusTable, {
    fields: [storeMenusTable.menuId],
    references: [menusTable.id],
  }),
}))
