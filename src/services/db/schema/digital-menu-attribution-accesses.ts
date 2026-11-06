import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { storesTable } from './stores'
import { whatsappBotConversationsTable } from './whatsapp-bot-conversations'

export const digitalMenuAttributionAccessesTable = pgTable(
  'digital_menu_attribution_accesses',
  {
    id: uuid('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull(),
    messageId: text('message_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    cartAt: timestamp('cart_at', { withTimezone: true }),
  },
  table => [
    foreignKey({
      name: 'digital_menu_attribution_accesses_conversation_store_fk',
      columns: [table.conversationId, table.storeId],
      foreignColumns: [
        whatsappBotConversationsTable.id,
        whatsappBotConversationsTable.storeId,
      ],
    }).onDelete('cascade'),
    index('digital_menu_attribution_accesses_store_created_idx').on(
      table.storeId,
      table.createdAt
    ),
    check(
      'digital_menu_attribution_accesses_message_check',
      sql`${table.messageId} ~ '^assistant:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'`
    ),
    check(
      'digital_menu_attribution_accesses_cart_check',
      sql`${table.cartAt} IS NULL OR ${table.cartAt} >= ${table.createdAt}`
    ),
  ]
).enableRLS()

export type SelectDigitalMenuAttributionAccess =
  typeof digitalMenuAttributionAccessesTable.$inferSelect
