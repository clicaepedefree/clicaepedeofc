import {
  createdAt,
  updatedAt,
  baseTimestampColumnGenerator,
} from '@/services/db/schema/utils'
import { pgTable, serial, text } from 'drizzle-orm/pg-core'

export const storeStatuses = [
  'implementing',
  'active',
  'inactive',
  'pending_recovery',
  'archived',
] as const

export const storesTable = pgTable('stores', {
  id: serial('id').primaryKey(),
  subdomain: text('subdomain').unique().notNull(),
  name: text('name').notNull(),
  status: text('status', { enum: storeStatuses }).notNull().default('active'),
  statusReason: text('status_reason'),
  statusUpdatedAt: baseTimestampColumnGenerator('status_updated_at')
    .notNull()
    .defaultNow(),
  cancelledAt: baseTimestampColumnGenerator('cancelled_at'),
  cancellationReason: text('cancellation_reason'),
  createdAt,
  updatedAt,
})

export type InsertStore = typeof storesTable.$inferInsert
export type SelectStore = typeof storesTable.$inferSelect
