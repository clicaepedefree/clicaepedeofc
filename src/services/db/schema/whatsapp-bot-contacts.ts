import { storesTable } from '@/services/db/schema/stores'
import {
  baseTimestampColumnGenerator,
  createdAt,
  updatedAt,
} from '@/services/db/schema/utils'
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  unique,
} from 'drizzle-orm/pg-core'

export const whatsappBotContactSources = [
  'whatsapp',
  'manual',
  'imported',
  'digital_menu',
] as const

export const whatsappBotContactsTable = pgTable(
  'whatsapp_bot_contacts',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    phoneNumber: text('phone_number').notNull(),
    displayName: text('display_name'),
    source: text('source', { enum: whatsappBotContactSources })
      .notNull()
      .default('whatsapp'),
    firstContactAt: baseTimestampColumnGenerator('first_contact_at')
      .notNull()
      .defaultNow(),
    lastContactAt: baseTimestampColumnGenerator('last_contact_at')
      .notNull()
      .defaultNow(),
    promotionalOptOutAt: baseTimestampColumnGenerator('promotional_opt_out_at'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
    updatedAt,
  },
  table => [
    unique('whatsapp_bot_contacts_store_phone_unique').on(
      table.storeId,
      table.phoneNumber
    ),
    unique('whatsapp_bot_contacts_id_store_unique').on(table.id, table.storeId),
    index('whatsapp_bot_contacts_store_last_contact_idx').on(
      table.storeId,
      table.lastContactAt
    ),
  ]
)

export type InsertWhatsappBotContact =
  typeof whatsappBotContactsTable.$inferInsert
export type SelectWhatsappBotContact =
  typeof whatsappBotContactsTable.$inferSelect
