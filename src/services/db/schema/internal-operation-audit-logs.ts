import { createdAt } from '@/services/db/schema/utils'
import { integer, pgTable, serial, text, uuid } from 'drizzle-orm/pg-core'
import { storesTable } from './stores'
import { usersTable } from './users'

export const internalOperationActions = [
  'reactivate_store',
  'archive_store',
] as const

export const internalOperationAuditLogsTable = pgTable(
  'internal_operation_audit_logs',
  {
    id: serial('id').primaryKey(),
    action: text('action', { enum: internalOperationActions }).notNull(),
    actorClerkId: text('actor_clerk_id').notNull(),
    actorEmail: text('actor_email').notNull(),
    actorName: text('actor_name'),
    storeId: integer('store_id').references(() => storesTable.id, {
      onDelete: 'no action',
    }),
    targetUserId: uuid('target_user_id').references(() => usersTable.id, {
      onDelete: 'no action',
    }),
    targetUserEmail: text('target_user_email'),
    previousStoreStatus: text('previous_store_status').notNull(),
    newStoreStatus: text('new_store_status').notNull(),
    reason: text('reason').notNull(),
    createdAt,
  }
)

export type InsertInternalOperationAuditLog =
  typeof internalOperationAuditLogsTable.$inferInsert
export type SelectInternalOperationAuditLog =
  typeof internalOperationAuditLogsTable.$inferSelect
