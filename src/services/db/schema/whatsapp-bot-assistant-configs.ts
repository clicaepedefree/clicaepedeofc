import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { whatsappBotNumbersTable } from '@/services/db/schema/whatsapp-bot-numbers'
import {
  foreignKey,
  index,
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  unique,
} from 'drizzle-orm/pg-core'

export const whatsappBotAssistantTones = [
  'friendly',
  'professional',
  'casual',
  'direct',
] as const

export const whatsappBotAssistantResponseLengths = [
  'short',
  'medium',
  'detailed',
] as const

export const whatsappBotAssistantEmojiUsages = [
  'none',
  'light',
  'expressive',
] as const

export const whatsappBotAssistantConfigStatuses = [
  'draft',
  'active',
  'paused',
] as const

export const whatsappBotAssistantConfigsTable = pgTable(
  'whatsapp_bot_assistant_configs',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    numberId: integer('number_id'),
    assistantName: text('assistant_name')
      .notNull()
      .default('Assistente virtual'),
    greetingMessage: text('greeting_message')
      .notNull()
      .default(
        'Oi! Eu sou o assistente virtual da loja. Posso te ajudar com o cardapio, horarios, pagamentos e pedidos.'
      ),
    fallbackMessage: text('fallback_message')
      .notNull()
      .default(
        'Nao tenho certeza sobre isso. Posso te enviar o cardapio ou chamar uma pessoa da equipe para ajudar.'
      ),
    tone: text('tone', { enum: whatsappBotAssistantTones })
      .notNull()
      .default('friendly'),
    responseLength: text('response_length', {
      enum: whatsappBotAssistantResponseLengths,
    })
      .notNull()
      .default('medium'),
    emojiUsage: text('emoji_usage', { enum: whatsappBotAssistantEmojiUsages })
      .notNull()
      .default('light'),
    additionalInstructions: text('additional_instructions'),
    status: text('status', { enum: whatsappBotAssistantConfigStatuses })
      .notNull()
      .default('draft'),
    testModeEnabled: boolean('test_mode_enabled').notNull().default(true),
    updatedByUserId: text('updated_by_user_id'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
    updatedAt,
  },
  table => [
    foreignKey({
      name: 'whatsapp_bot_assistant_configs_number_store_fk',
      columns: [table.numberId, table.storeId],
      foreignColumns: [
        whatsappBotNumbersTable.id,
        whatsappBotNumbersTable.storeId,
      ],
    }),
    unique('whatsapp_bot_assistant_configs_store_unique').on(table.storeId),
    unique('whatsapp_bot_assistant_configs_id_store_unique').on(
      table.id,
      table.storeId
    ),
    index('whatsapp_bot_assistant_configs_store_status_idx').on(
      table.storeId,
      table.status
    ),
  ]
)

export type InsertWhatsappBotAssistantConfig =
  typeof whatsappBotAssistantConfigsTable.$inferInsert
export type SelectWhatsappBotAssistantConfig =
  typeof whatsappBotAssistantConfigsTable.$inferSelect
