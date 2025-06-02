import { itemOfferingsTable } from '@/services/db/schema/item-offerings'
import { menusTable } from '@/services/db/schema/menus'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { boolean, integer, pgTable, serial, text } from 'drizzle-orm/pg-core'

export const menuItemOfferingsTable = pgTable('menu_item_offerings', {
  id: serial('id').primaryKey(),
  itemOfferingId: integer('item_offering_id')
    .notNull()
    .references(() => itemOfferingsTable.id, { onDelete: 'cascade' }),
  menuId: integer('menu_id')
    .notNull()
    .references(() => menusTable.id, { onDelete: 'cascade' }),
  index: integer('index'),
  isAvailable: boolean('is_available'),
  price: integer('price'),
  originalPrice: integer('original_price'),
  externalCode: text('external_code'),
  createdAt,
  updatedAt,
})

export type InsertMenuItemOffering = typeof menuItemOfferingsTable.$inferInsert
export type SelectMenuItemOffering = typeof menuItemOfferingsTable.$inferSelect
