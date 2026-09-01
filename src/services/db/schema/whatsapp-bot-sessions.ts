import { whatsappBotNumbersTable } from '@/services/db/schema/whatsapp-bot-numbers'
import { storesTable } from '@/services/db/schema/stores'
import {
  baseTimestampColumnGenerator,
  createdAt,
  updatedAt,
} from '@/services/db/schema/utils'
import { sql } from 'drizzle-orm'
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const whatsappBotSessionStatuses = [
  'disconnected',
  'pending_qr',
  'connecting',
  'connected',
  'paused',
  'error',
] as const

export const whatsappBotSessionsTable = pgTable(
  'whatsapp_bot_sessions',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    numberId: integer('number_id').notNull(),
    provider: text('provider').notNull().default('evolution'),
    providerSessionId: text('provider_session_id').notNull(),
    status: text('status', { enum: whatsappBotSessionStatuses })
      .notNull()
      .default('disconnected'),
    qrCodeExpiresAt: baseTimestampColumnGenerator('qr_code_expires_at'),
    connectedAt: baseTimestampColumnGenerator('connected_at'),
    disconnectedAt: baseTimestampColumnGenerator('disconnected_at'),
    lastHeartbeatAt: baseTimestampColumnGenerator('last_heartbeat_at'),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
    updatedAt,
  },
  table => [
    foreignKey({
      name: 'whatsapp_bot_sessions_number_store_fk',
      columns: [table.numberId, table.storeId],
      foreignColumns: [
        whatsappBotNumbersTable.id,
        whatsappBotNumbersTable.storeId,
      ],
    }).onDelete('cascade'),
    unique('whatsapp_bot_sessions_provider_instance_unique').on(
      table.provider,
      table.providerSessionId
    ),
    unique('whatsapp_bot_sessions_id_store_unique').on(table.id, table.storeId),
    uniqueIndex('whatsapp_bot_sessions_one_connected_per_store_idx')
      .on(table.storeId)
      .where(sql`${table.status} IN ('pending_qr', 'connecting', 'connected')`),
    index('whatsapp_bot_sessions_store_status_idx').on(
      table.storeId,
      table.status
    ),
    index('whatsapp_bot_sessions_number_status_idx').on(
      table.storeId,
      table.numberId,
      table.status
    ),
  ]
)

export type InsertWhatsappBotSession =
  typeof whatsappBotSessionsTable.$inferInsert
export type SelectWhatsappBotSession =
  typeof whatsappBotSessionsTable.$inferSelect
