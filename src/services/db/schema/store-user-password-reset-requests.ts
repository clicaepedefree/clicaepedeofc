import {
  baseTimestampColumnGenerator,
  createdAt,
  updatedAt,
} from '@/services/db/schema/utils'
import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { storesTable } from './stores'
import { usersTable } from './users'

export const storeUserPasswordResetRequestStatuses = [
  'pending',
  'consumed',
  'completed',
  'revoked',
  'expired',
] as const

export const storeUserPasswordResetRequestsTable = pgTable(
  'store_user_password_reset_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    targetUserId: uuid('target_user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    targetEmail: text('target_email').notNull(),
    targetClerkId: text('target_clerk_id').notNull(),
    status: text('status', {
      enum: storeUserPasswordResetRequestStatuses,
    })
      .notNull()
      .default('pending'),
    expiresAt: baseTimestampColumnGenerator('expires_at').notNull(),
    consumedAt: baseTimestampColumnGenerator('consumed_at'),
    completedAt: baseTimestampColumnGenerator('completed_at'),
    revokedAt: baseTimestampColumnGenerator('revoked_at'),
    requestedByClerkId: text('requested_by_clerk_id').notNull(),
    requestedByEmail: text('requested_by_email').notNull(),
    createdAt,
    updatedAt,
  },
  table => [
    index('store_user_password_reset_requests_store_idx').on(
      table.storeId,
      table.createdAt
    ),
    index('store_user_password_reset_requests_target_idx').on(
      table.targetUserId,
      table.status
    ),
  ]
)

export type InsertStoreUserPasswordResetRequest =
  typeof storeUserPasswordResetRequestsTable.$inferInsert
export type SelectStoreUserPasswordResetRequest =
  typeof storeUserPasswordResetRequestsTable.$inferSelect
