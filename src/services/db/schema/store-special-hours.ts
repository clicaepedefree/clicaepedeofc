import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { boolean, date, integer, pgTable, serial, text, time } from 'drizzle-orm/pg-core'
import { storeBusinessHourServiceTypes } from './store-business-hours'

export const storeSpecialHoursTable = pgTable('store_special_hours', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  reason: text('reason'),
  isClosed: boolean('is_closed').notNull().default(false),
  opensAt: time('opens_at'),
  closesAt: time('closes_at'),
  serviceType: text('service_type', {
    enum: storeBusinessHourServiceTypes,
  })
    .notNull()
    .default('ALL'),
  createdAt,
  updatedAt,
})

export type InsertStoreSpecialHour = Omit<
  typeof storeSpecialHoursTable.$inferInsert,
  'id' | 'createdAt' | 'updatedAt'
>
export type SelectStoreSpecialHour = typeof storeSpecialHoursTable.$inferSelect
