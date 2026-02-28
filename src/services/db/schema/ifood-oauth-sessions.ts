import { createdAt } from '@/services/db/schema/utils'
import { integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'
import { storesTable } from './stores'

/**
 * Temporary storage for iFood OAuth sessions during the connection flow.
 * Sessions are created when user initiates OAuth, and deleted after successful connection.
 * Tokens and verifier are stored server-side only and never exposed to the frontend.
 */
export const ifoodOAuthSessionsTable = pgTable('ifood_oauth_sessions', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id, { onDelete: 'cascade' }),
  userCode: text('user_code').notNull(), // The code shown to user
  authorizationCodeVerifier: text('authorization_code_verifier').notNull(), // PKCE verifier, server-side only
  accessToken: text('access_token'), // Encrypted, nullable until exchange completes
  refreshToken: text('refresh_token'), // Encrypted, nullable until exchange completes
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(), // Session TTL (10 min)
  createdAt,
})

export type InsertIfoodOAuthSession = typeof ifoodOAuthSessionsTable.$inferInsert
export type SelectIfoodOAuthSession = typeof ifoodOAuthSessionsTable.$inferSelect
