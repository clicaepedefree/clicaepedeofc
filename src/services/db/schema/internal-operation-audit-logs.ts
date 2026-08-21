import { createdAt } from '@/services/db/schema/utils'
import { integer, pgTable, serial, text, uuid } from 'drizzle-orm/pg-core'
import { storesTable } from './stores'
import { usersTable } from './users'

export const internalOperationActions = [
  'create_store',
  'create_store_access_invite',
  'accept_store_access_invite',
  'update_store_profile',
  'update_store_implementation_checklist',
  'activate_store_after_implementation',
  'activate_store_commercial',
  'reactivate_store_commercial',
  'inactivate_store_commercial',
  'cancel_store_commercial',
  'block_store_access',
  'unblock_store_access',
  'update_store_subscription_terms',
  'change_store_subscription_plan',
  'create_manual_billing_invoice',
  'mark_manual_billing_invoice_payment',
  'reschedule_billing_invoice_due_date',
  'adjust_billing_invoice_amount',
  'cancel_billing_invoice',
  'refund_billing_invoice',
  'auto_unblock_billing_access',
  'manage_store_module_entitlement',
  'create_store_user_invite',
  'update_store_user',
  'revoke_store_user',
  'transfer_store_primary_responsible',
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
