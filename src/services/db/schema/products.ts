import { pgTable, serial, text, integer } from 'drizzle-orm/pg-core'
import { createdAt, updatedAt } from './utils'
import { storesTable } from './stores'

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
