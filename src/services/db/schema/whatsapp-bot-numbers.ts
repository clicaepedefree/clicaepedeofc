import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { isNotNull } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const whatsappBotNumberStatuses = [
  'inactive',
  'active',
  'disconnected',
  'error',
] as const

export const whatsappBotNumbersTable = pgTable(
  'whatsapp_bot_numbers',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('evolution'),
    providerNumberId: text('provider_number_id'),
    phoneNumber: text('phone_number').notNull(),
    displayName: text('display_name'),
    status: text('status', { enum: whatsappBotNumberStatuses })
      .notNull()
      .default('inactive'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
    updatedAt,
  },
  table => [
    unique('whatsapp_bot_numbers_store_phone_unique').on(
      table.storeId,
      table.phoneNumber
    ),
    unique('whatsapp_bot_numbers_id_store_unique').on(table.id, table.storeId),
    uniqueIndex('whatsapp_bot_numbers_provider_number_unique')
      .on(table.provider, table.providerNumberId)
      .where(isNotNull(table.providerNumberId)),
    index('whatsapp_bot_numbers_store_status_idx').on(
      table.storeId,
      table.status
    ),
  ]
)

export type InsertWhatsappBotNumber =
  typeof whatsappBotNumbersTable.$inferInsert
export type SelectWhatsappBotNumber =
  typeof whatsappBotNumbersTable.$inferSelect
