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
import { isNotNull } from 'drizzle-orm'
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

export const whatsappBotMessageDirections = [
  'inbound',
  'outbound',
  'internal',
] as const

export const whatsappBotMessageSenderTypes = [
  'customer',
  'bot',
  'human',
  'system',
] as const

export const whatsappBotMessageTypes = [
  'text',
  'audio',
  'image',
  'document',
  'unknown',
] as const

export const whatsappBotMessageStatuses = [
  'received',
  'queued',
  'sent',
  'delivered',
  'read',
  'failed',
  'skipped',
] as const

export const whatsappBotMessagesTable = pgTable(
  'whatsapp_bot_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull(),
    contactId: integer('contact_id'),
    numberId: integer('number_id'),
    sessionId: integer('session_id'),
    providerMessageId: text('provider_message_id'),
    direction: text('direction', {
      enum: whatsappBotMessageDirections,
    }).notNull(),
    senderType: text('sender_type', {
      enum: whatsappBotMessageSenderTypes,
    }).notNull(),
    messageType: text('message_type', { enum: whatsappBotMessageTypes })
      .notNull()
      .default('text'),
    body: text('body'),
    transcription: text('transcription'),
    status: text('status', { enum: whatsappBotMessageStatuses })
      .notNull()
      .default('received'),
    occurredAt: baseTimestampColumnGenerator('occurred_at')
      .notNull()
      .defaultNow(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
    updatedAt,
  },
  table => [
    foreignKey({
      name: 'whatsapp_bot_messages_conversation_store_fk',
      columns: [table.conversationId, table.storeId],
      foreignColumns: [
        whatsappBotConversationsTable.id,
        whatsappBotConversationsTable.storeId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'whatsapp_bot_messages_contact_store_fk',
      columns: [table.contactId, table.storeId],
      foreignColumns: [
        whatsappBotContactsTable.id,
        whatsappBotContactsTable.storeId,
      ],
    }),
    foreignKey({
      name: 'whatsapp_bot_messages_number_store_fk',
      columns: [table.numberId, table.storeId],
      foreignColumns: [
        whatsappBotNumbersTable.id,
        whatsappBotNumbersTable.storeId,
      ],
    }),
    foreignKey({
      name: 'whatsapp_bot_messages_session_store_fk',
      columns: [table.sessionId, table.storeId],
      foreignColumns: [
        whatsappBotSessionsTable.id,
        whatsappBotSessionsTable.storeId,
      ],
    }),
    uniqueIndex('whatsapp_bot_messages_provider_message_unique')
      .on(table.storeId, table.providerMessageId)
      .where(isNotNull(table.providerMessageId)),
    index('whatsapp_bot_messages_conversation_time_idx').on(
      table.storeId,
      table.conversationId,
      table.occurredAt
    ),
    index('whatsapp_bot_messages_status_idx').on(
      table.storeId,
      table.status,
      table.createdAt
    ),
  ]
)

export type InsertWhatsappBotMessage =
  typeof whatsappBotMessagesTable.$inferInsert
export type SelectWhatsappBotMessage =
  typeof whatsappBotMessagesTable.$inferSelect
