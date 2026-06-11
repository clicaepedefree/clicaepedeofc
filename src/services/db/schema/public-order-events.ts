import { createdAt } from '@/services/db/schema/utils'
import { integer, jsonb, pgTable, serial, text, uuid } from 'drizzle-orm/pg-core'
import { publicOrderSubmissionsTable } from './public-order-submissions'
import { storesTable } from './stores'

export const publicOrderActorTypes = [
  'customer',
  'system',
  'store',
  'ops_admin',
] as const

export const publicOrderEventsTable = pgTable('public_order_events', {
  id: serial('id').primaryKey(),
  publicOrderId: uuid('public_order_id')
    .notNull()
    .references(() => publicOrderSubmissionsTable.id, { onDelete: 'cascade' }),
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  actorType: text('actor_type', { enum: publicOrderActorTypes }).notNull(),
  actorUserId: text('actor_user_id'),
  requestId: text('request_id').notNull(),
  payload: jsonb('payload'),
  createdAt,
})

export type InsertPublicOrderEvent = Omit<
  typeof publicOrderEventsTable.$inferInsert,
  'id' | 'createdAt'
>
export type SelectPublicOrderEvent = typeof publicOrderEventsTable.$inferSelect
