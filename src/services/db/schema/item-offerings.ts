import { categoriesTable } from '@/services/db/schema/categories'
import { itemsTable } from '@/services/db/schema/items'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { boolean, integer, numeric, pgTable, serial, text } from 'drizzle-orm/pg-core'

export const itemOfferingsTable = pgTable('item_offerings', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => categoriesTable.id, { onDelete: 'cascade' }),
  itemId: integer('item_id')
    .notNull()
    .references(() => itemsTable.id, { onDelete: 'cascade' }),
  index: integer('index').notNull(),
  isAvailable: boolean('is_available').notNull().default(true),
  price: numeric('price', { precision: 19, scale: 4 }).notNull(),
  originalPrice: numeric('original_price', { precision: 19, scale: 4 }),
  externalCode: text('external_code'),
  createdAt,
  updatedAt,
})

export type InsertItemOffering = Omit<typeof itemOfferingsTable.$inferInsert, 'createdAt' | 'updatedAt'>
export type SelectItemOffering = typeof itemOfferingsTable.$inferSelect
