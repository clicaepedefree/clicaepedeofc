import {
  createdAt,
  updatedAt,
  baseTimestampColumnGenerator,
} from '@/services/db/schema/utils'
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { storesTable } from './stores'
import { usersTable } from './users'

export const storeAccessInviteStatuses = ['pending', 'used', 'revoked'] as const
export const storeAccessInviteDeliveryChannels = [
  'manual',
  'email',
  'whatsapp',
] as const
export const storeAccessInviteDeliveryStatuses = [
  'pending',
  'ready',
  'sent',
  'failed',
] as const

export const storeAccessInvitesTable = pgTable(
  'store_access_invites',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    targetUserId: uuid('target_user_id').references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    targetEmail: text('target_email').notNull(),
    role: text('role', { enum: ['admin'] })
      .notNull()
      .default('admin'),
    tokenHash: text('token_hash').notNull(),
    status: text('status', { enum: storeAccessInviteStatuses })
      .notNull()
      .default('pending'),
    deliveryChannel: text('delivery_channel', {
      enum: storeAccessInviteDeliveryChannels,
    })
      .notNull()
      .default('manual'),
    deliveryStatus: text('delivery_status', {
      enum: storeAccessInviteDeliveryStatuses,
    })
      .notNull()
      .default('ready'),
    expiresAt: baseTimestampColumnGenerator('expires_at').notNull(),
    usedAt: baseTimestampColumnGenerator('used_at'),
    revokedAt: baseTimestampColumnGenerator('revoked_at'),
    createdByClerkId: text('created_by_clerk_id').notNull(),
    createdByEmail: text('created_by_email').notNull(),
    acceptedByClerkId: text('accepted_by_clerk_id'),
    acceptedByEmail: text('accepted_by_email'),
    createdAt,
    updatedAt,
  },
  table => [
    uniqueIndex('store_access_invites_token_hash_unique').on(table.tokenHash),
    index('store_access_invites_store_email_idx').on(
      table.storeId,
      table.targetEmail
    ),
    index('store_access_invites_status_expires_idx').on(
      table.status,
      table.expiresAt
    ),
  ]
)

export type InsertStoreAccessInvite =
  typeof storeAccessInvitesTable.$inferInsert
export type SelectStoreAccessInvite =
  typeof storeAccessInvitesTable.$inferSelect
