import { createdAt } from '@/services/db/schema/utils'
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  uuid,
} from 'drizzle-orm/pg-core'
import { publicOrderSubmissionsTable } from './public-order-submissions'
import { storesTable } from './stores'

export const publicOrderActorTypes = [
  'customer',
  'system',
  'store',
  'ops_admin',
] as const

export const publicOrderEventsTable = pgTable(
  'public_order_events',
  {
    id: serial('id').primaryKey(),
    publicOrderId: uuid('public_order_id').notNull(),
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
  },
  table => [
    foreignKey({
      name: 'public_order_events_submission_store_fk',
      columns: [table.publicOrderId, table.storeId],
      foreignColumns: [
        publicOrderSubmissionsTable.id,
        publicOrderSubmissionsTable.storeId,
      ],
    }).onDelete('cascade'),
    index('public_order_events_public_order_created_idx').on(
      table.publicOrderId,
      table.createdAt
    ),
  ]
)

export type InsertPublicOrderEvent = Omit<
  typeof publicOrderEventsTable.$inferInsert,
  'id' | 'createdAt'
>
export type SelectPublicOrderEvent = typeof publicOrderEventsTable.$inferSelect
