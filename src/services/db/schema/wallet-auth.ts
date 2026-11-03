import { integer, pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'
import { storesTable } from './stores'

export const walletAuthChallengesTable = pgTable(
  'wallet_auth_challenges',
  {
    idHash: text('id_hash').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
    bindingHash: text('binding_hash').notNull(),
    codeHash: text('code_hash').notNull(),
    status: text('status', {
      enum: ['pending', 'sent', 'unknown', 'consumed', 'locked'],
    })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [index('wallet_auth_challenge_expiry_idx').on(t.expiresAt), index('wallet_auth_challenge_scope_idx').on(t.storeId, t.phone, t.bindingHash)]
)

export const walletAuthSessionsTable = pgTable(
  'wallet_auth_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
    bindingHash: text('binding_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  t => [index('wallet_auth_session_expiry_idx').on(t.expiresAt)]
)

export const walletAuthRatesTable = pgTable('wallet_auth_rates', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  lastAt: timestamp('last_at', { withTimezone: true }).notNull(),
}, t => [index('wallet_auth_rate_retention_idx').on(t.lastAt)])
