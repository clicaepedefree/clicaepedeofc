import { storesTable } from '@/services/db/schema/stores'
import { whatsappBotContactsTable } from '@/services/db/schema/whatsapp-bot-contacts'
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

export const whatsappBotConversationModes = ['automatic', 'human'] as const

export const whatsappBotConversationStatuses = [
  'open',
  'pending_human',
  'closed',
  'blocked',
] as const

export const whatsappBotConversationsTable = pgTable(
  'whatsapp_bot_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    contactId: integer('contact_id').notNull(),
    numberId: integer('number_id'),
    sessionId: integer('session_id'),
    mode: text('mode', { enum: whatsappBotConversationModes })
      .notNull()
      .default('automatic'),
    status: text('status', { enum: whatsappBotConversationStatuses })
      .notNull()
      .default('open'),
    contextSummary: text('context_summary'),
    humanPausedAt: baseTimestampColumnGenerator('human_paused_at'),
    returnedToBotAt: baseTimestampColumnGenerator('returned_to_bot_at'),
    lastMessageAt: baseTimestampColumnGenerator('last_message_at'),
    closedAt: baseTimestampColumnGenerator('closed_at'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
    updatedAt,
  },
  table => [
    unique('whatsapp_bot_conversations_id_store_unique').on(
      table.id,
      table.storeId
    ),
    foreignKey({
      name: 'whatsapp_bot_conversations_contact_store_fk',
      columns: [table.contactId, table.storeId],
      foreignColumns: [
        whatsappBotContactsTable.id,
        whatsappBotContactsTable.storeId,
      ],
    }).onDelete('cascade'),
    foreignKey({
      name: 'whatsapp_bot_conversations_number_store_fk',
      columns: [table.numberId, table.storeId],
      foreignColumns: [
        whatsappBotNumbersTable.id,
        whatsappBotNumbersTable.storeId,
      ],
    }),
    foreignKey({
      name: 'whatsapp_bot_conversations_session_store_fk',
      columns: [table.sessionId, table.storeId],
      foreignColumns: [
        whatsappBotSessionsTable.id,
        whatsappBotSessionsTable.storeId,
      ],
    }),
    index('whatsapp_bot_conversations_store_status_idx').on(
      table.storeId,
      table.status,
      table.lastMessageAt
    ),
    index('whatsapp_bot_conversations_contact_idx').on(
      table.storeId,
      table.contactId,
      table.createdAt
    ),
    index('whatsapp_bot_conversations_number_status_idx').on(
      table.storeId,
      table.numberId,
      table.status
    ),
  ]
)

export type InsertWhatsappBotConversation =
  typeof whatsappBotConversationsTable.$inferInsert
export type SelectWhatsappBotConversation =
  typeof whatsappBotConversationsTable.$inferSelect
