import { createdAt } from '@/services/db/schema/utils'
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { ordersTable } from './orders'
import { storesTable } from './stores'

export const orderAuditEventTypes = [
  'order_created',
  'historical_snapshot',
  'status_changed',
  'note_added',
] as const
export const orderAuditActorTypes = ['store', 'customer', 'system'] as const
export const orderAuditOrigins = ['POS', 'DIGITAL_MENU', 'MANUAL', 'SYSTEM'] as const

export const orderAuditEventsTable = pgTable(
  'order_audit_events',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id').notNull(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'restrict' }),
    eventType: text('event_type', { enum: orderAuditEventTypes }).notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    actorType: text('actor_type', { enum: orderAuditActorTypes }),
    actorUserId: text('actor_user_id'),
    origin: text('origin', { enum: orderAuditOrigins }).notNull(),
    reason: text('reason'),
    requestId: text('request_id').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ipHash: text('ip_hash'),
    userAgentHash: text('user_agent_hash'),
    createdAt,
  },
  table => [
    foreignKey({
      name: 'order_audit_events_order_store_fk',
      columns: [table.orderId, table.storeId],
      foreignColumns: [ordersTable.id, ordersTable.storeId],
    }).onDelete('restrict'),
    uniqueIndex('order_audit_events_request_id_unique').on(table.requestId),
    index('order_audit_events_order_store_created_idx').on(
      table.orderId,
      table.storeId,
      table.createdAt
    ),
    index('order_audit_events_store_created_idx').on(table.storeId, table.createdAt),
  ]
)

export type InsertOrderAuditEvent = Omit<
  typeof orderAuditEventsTable.$inferInsert,
  'id' | 'createdAt'
>
export type SelectOrderAuditEvent = typeof orderAuditEventsTable.$inferSelect
