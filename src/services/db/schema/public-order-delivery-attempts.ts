import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { integer, pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { publicOrderSubmissionsTable } from './public-order-submissions'

export const publicOrderDeliveryAttemptStatuses = [
  'queued',
  'sent',
  'acked',
  'failed',
  'dead_letter',
] as const

export const publicOrderDeliveryAttemptsTable = pgTable(
  'public_order_delivery_attempts',
  {
    id: serial('id').primaryKey(),
    publicOrderId: uuid('public_order_id')
      .notNull()
      .references(() => publicOrderSubmissionsTable.id, { onDelete: 'cascade' }),
    attempt: integer('attempt').notNull(),
    status: text('status', {
      enum: publicOrderDeliveryAttemptStatuses,
    }).notNull(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  }
)

export type InsertPublicOrderDeliveryAttempt = Omit<
  typeof publicOrderDeliveryAttemptsTable.$inferInsert,
  'id' | 'createdAt' | 'updatedAt'
>
export type SelectPublicOrderDeliveryAttempt =
  typeof publicOrderDeliveryAttemptsTable.$inferSelect
