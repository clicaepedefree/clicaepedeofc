import { baseTimestampColumnGenerator } from '@/services/db/schema/utils'
import { sql } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core'

export type WhatsappRetentionPolicySnapshot = {
  openConversationDays: 90
  closedConversationDays: 30
  transactionalEventDays: 180
  deliveryAttemptDays: 180
  inactiveContactDays: 365
  expiredQrCodeMinutes: 15
  digitalMenuAttributionDays?: 30
}

export type WhatsappRetentionRunCounts = {
  expiredQrSessions: number
  deletedDeliveryAttempts: number
  deletedTransactionalEvents: number
  deletedMessages: number
  deletedConversations: number
  deletedContacts: number
  deletedAttributionAccesses?: number
}

export const whatsappRetentionRunsTable = pgTable(
  'whatsapp_retention_runs',
  {
    id: uuid('id').primaryKey(),
    correlationId: uuid('correlation_id').notNull(),
    actorId: text('actor_id', {
      enum: ['system:whatsapp-retention'],
    }).notNull(),
    jobName: text('job_name', {
      enum: ['whatsapp-transactional-retention'],
    }).notNull(),
    policyVersion: text('policy_version', {
      enum: ['2026-10-08.v1', '2026-11-04.v2'],
    }).notNull(),
    policySnapshot: jsonb('policy_snapshot')
      .$type<WhatsappRetentionPolicySnapshot>()
      .notNull(),
    storeIds: integer('store_ids').array(),
    effectiveAt: baseTimestampColumnGenerator('effective_at').notNull(),
    startedAt: baseTimestampColumnGenerator('started_at')
      .notNull()
      .default(sql`clock_timestamp()`),
    finishedAt: baseTimestampColumnGenerator('finished_at'),
    status: text('status', {
      enum: ['running', 'succeeded', 'noop', 'failed'],
    })
      .notNull()
      .default('running'),
    counts: jsonb('counts').$type<WhatsappRetentionRunCounts>(),
    errorCode: text('error_code', { enum: ['prune_failed'] }),
  },
  table => [
    index('whatsapp_retention_runs_started_at_idx').on(table.startedAt.desc()),
    index('whatsapp_retention_runs_correlation_id_idx').on(table.correlationId),
  ]
)

export type InsertWhatsappRetentionRun =
  typeof whatsappRetentionRunsTable.$inferInsert
export type SelectWhatsappRetentionRun =
  typeof whatsappRetentionRunsTable.$inferSelect
