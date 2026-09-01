import { ordersTable } from '@/services/db/schema/orders'
import { storesTable } from '@/services/db/schema/stores'
import { whatsappBotContactsTable } from '@/services/db/schema/whatsapp-bot-contacts'
import { whatsappBotConversationsTable } from '@/services/db/schema/whatsapp-bot-conversations'
import { whatsappBotNumbersTable } from '@/services/db/schema/whatsapp-bot-numbers'
import { whatsappBotSessionsTable } from '@/services/db/schema/whatsapp-bot-sessions'
import {
  baseTimestampColumnGenerator,
  createdAt,
  updatedAt,
} from '@/services/db/schema/utils'
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

export const whatsappBotTransactionalEventTypes = [
  'order_status',
  'cashback',
  'loyalty',
  'manual',
  'fallback',
] as const

export const whatsappBotTransactionalEventStatuses = [
  'queued',
  'processing',
  'sent',
  'failed',
  'discarded',
] as const

export const whatsappBotTransactionalEventsTable = pgTable(
  'whatsapp_bot_transactional_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id'),
    contactId: integer('contact_id'),
    numberId: integer('number_id'),
    sessionId: integer('session_id'),
    orderId: integer('order_id'),
    channel: text('channel', { enum: ['whatsapp'] })
      .notNull()
      .default('whatsapp'),
    eventType: text('event_type', {
      enum: whatsappBotTransactionalEventTypes,
    }).notNull(),
    status: text('status', { enum: whatsappBotTransactionalEventStatuses })
      .notNull()
      .default('queued'),
    idempotencyKey: text('idempotency_key').notNull(),
    recipientPhone: text('recipient_phone').notNull(),
    payload: jsonb('payload').notNull().default({}),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    nextAttemptAt: baseTimestampColumnGenerator('next_attempt_at')
      .notNull()
      .defaultNow(),
    lastError: text('last_error'),
    processedAt: baseTimestampColumnGenerator('processed_at'),
    sentAt: baseTimestampColumnGenerator('sent_at'),
    createdAt,
    updatedAt,
  },
  table => [
    unique('whatsapp_bot_transactional_events_store_idempotency_unique').on(
      table.storeId,
      table.idempotencyKey
    ),
    unique('whatsapp_bot_transactional_events_id_store_unique').on(
      table.id,
      table.storeId
    ),
    foreignKey({
      name: 'whatsapp_bot_transactional_events_conversation_store_fk',
      columns: [table.conversationId, table.storeId],
      foreignColumns: [
        whatsappBotConversationsTable.id,
        whatsappBotConversationsTable.storeId,
      ],
    }),
    foreignKey({
      name: 'whatsapp_bot_transactional_events_contact_store_fk',
      columns: [table.contactId, table.storeId],
      foreignColumns: [
        whatsappBotContactsTable.id,
        whatsappBotContactsTable.storeId,
      ],
    }),
    foreignKey({
      name: 'whatsapp_bot_transactional_events_number_store_fk',
      columns: [table.numberId, table.storeId],
      foreignColumns: [
        whatsappBotNumbersTable.id,
        whatsappBotNumbersTable.storeId,
      ],
    }),
    foreignKey({
      name: 'whatsapp_bot_transactional_events_session_store_fk',
      columns: [table.sessionId, table.storeId],
      foreignColumns: [
        whatsappBotSessionsTable.id,
        whatsappBotSessionsTable.storeId,
      ],
    }),
    foreignKey({
      name: 'whatsapp_bot_transactional_events_order_store_fk',
      columns: [table.orderId, table.storeId],
      foreignColumns: [ordersTable.id, ordersTable.storeId],
    }),
    index('whatsapp_bot_transactional_events_store_status_idx').on(
      table.storeId,
      table.status,
      table.nextAttemptAt
    ),
    index('whatsapp_bot_transactional_events_conversation_idx').on(
      table.storeId,
      table.conversationId,
      table.createdAt
    ),
    index('whatsapp_bot_transactional_events_order_idx').on(
      table.storeId,
      table.orderId,
      table.createdAt
    ),
  ]
)

export type InsertWhatsappBotTransactionalEvent =
  typeof whatsappBotTransactionalEventsTable.$inferInsert
export type SelectWhatsappBotTransactionalEvent =
  typeof whatsappBotTransactionalEventsTable.$inferSelect
