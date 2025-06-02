import { menusTable } from '@/services/db/schema/menus'
import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { boolean, integer, pgTable } from 'drizzle-orm/pg-core'

export const storeMenusTable = pgTable('store_menus', {
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id, { onDelete: 'cascade' }),
  menuId: integer('menu_id')
    .notNull()
    .references(() => menusTable.id, { onDelete: 'cascade' }),
  isAvailable: boolean('is_available').notNull().default(false),
  createdAt,
  updatedAt,
})

export type InsertStoreMenu = typeof storeMenusTable.$inferInsert
export type SelectStoreMenu = typeof storeMenusTable.$inferSelect
