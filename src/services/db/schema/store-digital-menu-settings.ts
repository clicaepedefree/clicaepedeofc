import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { boolean, integer, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import { storeFilesTable } from './store-files'

export const storeOperationalStatuses = [
  'OPEN',
  'CLOSED',
  'PAUSED',
  'TAKEOUT_ONLY',
  'DELIVERY_ONLY',
] as const

export const storeDigitalMenuSettingsTable = pgTable('store_digital_menu_settings', {
  storeId: integer('store_id')
    .primaryKey()
    .references(() => storesTable.id, { onDelete: 'cascade' }),
  logoFileId: integer('logo_file_id').references(() => storeFilesTable.id, {
    onDelete: 'set null',
  }),
  whatsappPhone: text('whatsapp_phone'),
  isDigitalMenuEnabled: boolean('is_digital_menu_enabled').notNull().default(true),
  isAcceptingOrders: boolean('is_accepting_orders').notNull().default(true),
  operationalStatus: text('operational_status', {
    enum: storeOperationalStatuses,
  })
    .notNull()
    .default('OPEN'),
  operationalStatusMessage: text('operational_status_message'),
  manualPauseReason: text('manual_pause_reason'),
  manualPauseUntil: timestamp('manual_pause_until', { withTimezone: true }),
  minimumOrderAmount: numeric('minimum_order_amount', {
    precision: 19,
    scale: 4,
  })
    .notNull()
    .default('0'),
  averagePreparationMinutes: integer('average_preparation_minutes')
    .notNull()
    .default(30),
  allowScheduledOrders: boolean('allow_scheduled_orders').notNull().default(false),
  scheduleMinLeadMinutes: integer('schedule_min_lead_minutes').notNull().default(30),
  scheduleMaxDaysAhead: integer('schedule_max_days_ahead').notNull().default(7),
  createdAt,
  updatedAt,
})

export type InsertStoreDigitalMenuSettings = Omit<
  typeof storeDigitalMenuSettingsTable.$inferInsert,
  'createdAt' | 'updatedAt'
>
export type SelectStoreDigitalMenuSettings =
  typeof storeDigitalMenuSettingsTable.$inferSelect
