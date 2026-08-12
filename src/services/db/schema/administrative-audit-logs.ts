import { storesTable } from '@/services/db/schema/stores'
import { usersTable } from '@/services/db/schema/users'
import { createdAt } from '@/services/db/schema/utils'
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  uuid,
} from 'drizzle-orm/pg-core'

export const administrativeAuditScopes = [
  'store_data',
  'billing_plan',
  'module_entitlement',
  'billing_invoice',
  'access',
  'cancellation',
] as const

export const administrativeAuditActions = [
  'create',
  'update',
  'delete',
  'reactivate',
  'archive',
  'block',
  'cancel',
  'restore',
  'grant',
  'revoke',
] as const

export const administrativeAuditCriticalities = [
  'best_effort',
  'required',
] as const

export const administrativeAuditLogStatuses = [
  'recorded',
  'failed',
] as const

export const administrativeAuditLogsTable = pgTable(
  'administrative_audit_logs',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').references(() => storesTable.id, {
      onDelete: 'no action',
    }),
    scope: text('scope', { enum: administrativeAuditScopes }).notNull(),
    action: text('action', { enum: administrativeAuditActions }).notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    actorClerkId: text('actor_clerk_id').notNull(),
    actorEmail: text('actor_email').notNull(),
    actorName: text('actor_name'),
    targetUserId: uuid('target_user_id').references(() => usersTable.id, {
      onDelete: 'no action',
    }),
    targetUserEmail: text('target_user_email'),
    reason: text('reason').notNull(),
    previousValues: jsonb('previous_values'),
    newValues: jsonb('new_values'),
    metadata: jsonb('metadata').notNull().default({}),
    criticality: text('criticality', {
      enum: administrativeAuditCriticalities,
    })
      .notNull()
      .default('required'),
    status: text('status', { enum: administrativeAuditLogStatuses })
      .notNull()
      .default('recorded'),
    failureMessage: text('failure_message'),
    createdAt,
  },
  table => [
    index('administrative_audit_logs_store_created_idx').on(
      table.storeId,
      table.createdAt,
      table.id
    ),
    index('administrative_audit_logs_scope_created_idx').on(
      table.scope,
      table.createdAt
    ),
    index('administrative_audit_logs_actor_created_idx').on(
      table.actorEmail,
      table.createdAt
    ),
    index('administrative_audit_logs_entity_idx').on(
      table.entityType,
      table.entityId
    ),
  ]
)

export type InsertAdministrativeAuditLog =
  typeof administrativeAuditLogsTable.$inferInsert
export type SelectAdministrativeAuditLog =
  typeof administrativeAuditLogsTable.$inferSelect
