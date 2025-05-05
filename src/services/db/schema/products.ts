import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core'

export const productsTable = pgTable('products', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id),
  name: text('name').notNull(),
  description: text('description'),
  imagePath: text('image_path'),
  ean: text('ean'),
  externalCode: text('external_code'),
  unit: text('unit'),
  weightInUnits: integer('weight_in_units'),
  createdAt,
  updatedAt,
})

export type InsertProduct = typeof productsTable.$inferInsert
export type SelectProduct = typeof productsTable.$inferSelect
