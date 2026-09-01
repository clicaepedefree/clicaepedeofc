import { storesTable } from '@/services/db/schema/stores'
import { whatsappBotNumbersTable } from '@/services/db/schema/whatsapp-bot-numbers'
import { whatsappBotSessionsTable } from '@/services/db/schema/whatsapp-bot-sessions'
import { whatsappBotTransactionalEventsTable } from '@/services/db/schema/whatsapp-bot-transactional-events'
import {
  baseTimestampColumnGenerator,
  createdAt,
} from '@/services/db/schema/utils'
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

export const whatsappBotDeliveryAttemptStatuses = [
  'attempted',
  'succeeded',
  'failed',
  'skipped',
] as const

export const whatsappBotDeliveryAttemptsTable = pgTable(
  'whatsapp_bot_delivery_attempts',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').notNull(),
    numberId: integer('number_id'),
    sessionId: integer('session_id'),
    attemptNumber: integer('attempt_number').notNull(),
    status: text('status', {
      enum: whatsappBotDeliveryAttemptStatuses,
    }).notNull(),
    providerMessageId: text('provider_message_id'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    attemptedAt: baseTimestampColumnGenerator('attempted_at')
      .notNull()
      .defaultNow(),
    nextAttemptAt: baseTimestampColumnGenerator('next_attempt_at'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
  },
  table => [
    foreignKey({
      name: 'whatsapp_bot_delivery_attempts_event_store_fk',
      columns: [table.eventId, table.storeId],
      foreignColumns: [
        whatsappBotTransactionalEventsTable.id,
        whatsappBotTransactionalEventsTable.storeId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'whatsapp_bot_delivery_attempts_number_store_fk',
      columns: [table.numberId, table.storeId],
      foreignColumns: [
        whatsappBotNumbersTable.id,
        whatsappBotNumbersTable.storeId,
      ],
    }),
    foreignKey({
      name: 'whatsapp_bot_delivery_attempts_session_store_fk',
      columns: [table.sessionId, table.storeId],
      foreignColumns: [
        whatsappBotSessionsTable.id,
        whatsappBotSessionsTable.storeId,
      ],
    }),
    unique('whatsapp_bot_delivery_attempts_event_attempt_unique').on(
      table.eventId,
      table.attemptNumber
    ),
    index('whatsapp_bot_delivery_attempts_store_status_idx').on(
      table.storeId,
      table.status,
      table.attemptedAt
    ),
    index('whatsapp_bot_delivery_attempts_event_idx').on(
      table.eventId,
      table.attemptedAt
    ),
  ]
)

export type InsertWhatsappBotDeliveryAttempt =
  typeof whatsappBotDeliveryAttemptsTable.$inferInsert
export type SelectWhatsappBotDeliveryAttempt =
  typeof whatsappBotDeliveryAttemptsTable.$inferSelect
