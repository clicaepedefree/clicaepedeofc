import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { boolean, integer, numeric, pgTable, serial, text } from 'drizzle-orm/pg-core'

export const storeDeliveryZoneTypes = ['NEIGHBORHOOD', 'RADIUS', 'POSTAL_CODE'] as const

export const storeDeliveryZonesTable = pgTable('store_delivery_zones', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id, { onDelete: 'cascade' }),
  type: text('type', { enum: storeDeliveryZoneTypes }).notNull(),
  name: text('name').notNull(),
  neighborhood: text('neighborhood'),
  postalCodePrefix: text('postal_code_prefix'),
  centerLat: numeric('center_lat', { precision: 10, scale: 7 }),
  centerLng: numeric('center_lng', { precision: 10, scale: 7 }),
  radiusMeters: integer('radius_meters'),
  deliveryFee: numeric('delivery_fee', { precision: 19, scale: 4 })
    .notNull()
    .default('0'),
  freeDeliveryMinimum: numeric('free_delivery_minimum', {
    precision: 19,
    scale: 4,
  }),
  minimumOrderAmount: numeric('minimum_order_amount', {
    precision: 19,
    scale: 4,
  }),
  estimatedDeliveryMinutes: integer('estimated_delivery_minutes').notNull().default(45),
  priority: integer('priority').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt,
  updatedAt,
})

export type InsertStoreDeliveryZone = Omit<
  typeof storeDeliveryZonesTable.$inferInsert,
  'id' | 'createdAt' | 'updatedAt'
>
export type SelectStoreDeliveryZone = typeof storeDeliveryZonesTable.$inferSelect
