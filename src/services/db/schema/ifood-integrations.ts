import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { integer, jsonb, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import { storesTable } from './stores'

export const ifoodIntegrationsTable = pgTable('ifood_integrations', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .unique()
    .notNull()
    .references(() => storesTable.id, { onDelete: 'cascade' }),
  merchantId: text('merchant_id').notNull(),
  accessToken: text('access_token').notNull(), // Encrypted
  refreshToken: text('refresh_token').notNull(), // Encrypted
  tokenExpiresAt: timestamp('token_expires_at').notNull(),
  status: text('status', {
    enum: ['connected', 'disconnected', 'error'],
  })
    .notNull()
    .default('connected'),
  lastSyncAt: timestamp('last_sync_at'),
  syncErrors: jsonb('sync_errors'),
  createdAt,
  updatedAt,
})

export type InsertIfoodIntegration = typeof ifoodIntegrationsTable.$inferInsert
export type SelectIfoodIntegration = typeof ifoodIntegrationsTable.$inferSelect
