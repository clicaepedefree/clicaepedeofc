import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import { ordersTable } from './orders'

export const publicOrderStatuses = [
  'PENDING',
  'CREATED',
  'SENT_TO_STORE',
  'RECEIVED',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
] as const

export const publicOrderTechnicalStatuses = [
  'QUEUED',
  'DELIVERING',
  'ACKED',
  'RETRYING',
  'FAILED',
  'DEAD_LETTER',
] as const

export const publicOrderSubmissionsTable = pgTable(
  'public_order_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    orderId: integer('order_id').references(() => ordersTable.id, {
      onDelete: 'set null',
    }),
    requestId: text('request_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: text('status', { enum: publicOrderStatuses }).notNull(),
    technicalStatus: text('technical_status', {
      enum: publicOrderTechnicalStatuses,
    }).notNull(),
    salesChannel: text('sales_channel', { enum: ['DIGITAL_MENU'] }).notNull(),
    orderType: text('order_type', { enum: ['DELIVERY', 'TAKEOUT'] }).notNull(),
    cartSnapshot: jsonb('cart_snapshot').notNull(),
    totalsSnapshot: jsonb('totals_snapshot').notNull(),
    catalogSnapshot: jsonb('catalog_snapshot').notNull(),
    customerSnapshot: jsonb('customer_snapshot').notNull(),
    addressSnapshot: jsonb('address_snapshot'),
    paymentSnapshot: jsonb('payment_snapshot').notNull(),
    validationErrors: jsonb('validation_errors'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    technicalAckAt: timestamp('technical_ack_at', { withTimezone: true }),
    sentToStoreAt: timestamp('sent_to_store_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  table => [
    unique('public_order_submissions_store_id_idempotency_key_unique').on(
      table.storeId,
      table.idempotencyKey
    ),
  ]
)

export type InsertPublicOrderSubmission = Omit<
  typeof publicOrderSubmissionsTable.$inferInsert,
  'createdAt' | 'updatedAt'
>
export type SelectPublicOrderSubmission =
  typeof publicOrderSubmissionsTable.$inferSelect
