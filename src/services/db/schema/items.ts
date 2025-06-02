import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core'
import { storeFilesTable } from './store-files'

export const itemsTable = pgTable('items', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id),
  name: text('name').notNull(),
  description: text('description'),
  imageId: integer('image_id').references(() => storeFilesTable.id),
  ean: text('ean'),
  externalCode: text('external_code'),
  unit: text('unit'),
  weightInUnits: integer('weight_in_units'),
  createdAt,
  updatedAt,
})

export type InsertItem = Omit<typeof itemsTable.$inferInsert, 'createdAt' | 'updatedAt'>
export type SelectItem = typeof itemsTable.$inferSelect
