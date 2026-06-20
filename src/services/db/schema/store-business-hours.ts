import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { boolean, integer, pgTable, serial, text, time } from 'drizzle-orm/pg-core'

export const storeBusinessHourServiceTypes = ['DELIVERY', 'TAKEOUT', 'ALL'] as const

export const storeBusinessHoursTable = pgTable('store_business_hours', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id, { onDelete: 'cascade' }),
  weekday: integer('weekday').notNull(),
  opensAt: time('opens_at').notNull(),
  closesAt: time('closes_at').notNull(),
  serviceType: text('service_type', {
    enum: storeBusinessHourServiceTypes,
  })
    .notNull()
    .default('ALL'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt,
  updatedAt,
})

export type InsertStoreBusinessHour = Omit<
  typeof storeBusinessHoursTable.$inferInsert,
  'id' | 'createdAt' | 'updatedAt'
>
export type SelectStoreBusinessHour = typeof storeBusinessHoursTable.$inferSelect
