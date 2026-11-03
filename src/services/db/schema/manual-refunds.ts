import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { ordersTable } from './orders'
import { createdAt } from './utils'
import { userStorePermissionsTable } from './user-store-permissions'
import type { ManualRefundPaymentSnapshot } from '@/features/order/manual-refund-policy'

export const manualRefundsTable = pgTable(
  'manual_refunds',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').notNull(),
    orderId: integer('order_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    reason: text('reason').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    paymentSnapshot: jsonb('payment_snapshot')
      .$type<ManualRefundPaymentSnapshot[]>()
      .notNull(),
    reviewStatus: text('review_status', {
      enum: ['not_required', 'manual_review_pending', 'documented'],
    }).notNull(),
    confirmationKey: text('confirmation_key'),
    confirmationReason: text('confirmation_reason'),
    confirmedByUserId: uuid('confirmed_by_user_id'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt,
  },
  table => [
    foreignKey({
      name: 'manual_refunds_order_store_fk',
      columns: [table.orderId, table.storeId],
      foreignColumns: [ordersTable.id, ordersTable.storeId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'manual_refunds_actor_store_fk',
      columns: [table.actorUserId, table.storeId],
      foreignColumns: [
        userStorePermissionsTable.userId,
        userStorePermissionsTable.storeId,
      ],
    }).onDelete('restrict'),
    foreignKey({
      name: 'manual_refunds_confirmer_store_fk',
      columns: [table.confirmedByUserId, table.storeId],
      foreignColumns: [
        userStorePermissionsTable.userId,
        userStorePermissionsTable.storeId,
      ],
    }).onDelete('restrict'),
    uniqueIndex('manual_refunds_order_store_unique').on(
      table.orderId,
      table.storeId
    ),
    uniqueIndex('manual_refunds_store_command_unique').on(
      table.storeId,
      table.idempotencyKey
    ),
    uniqueIndex('manual_refunds_store_confirmation_unique').on(
      table.storeId,
      table.confirmationKey
    ),
    check(
      'manual_refunds_reason_check',
      sql`length(btrim(${table.reason})) between 1 and 1000`
    ),
    check(
      'manual_refunds_state_check',
      sql`jsonb_typeof(${table.paymentSnapshot}) = 'array' AND (
    (${table.reviewStatus} = 'not_required' AND jsonb_array_length(${table.paymentSnapshot}) = 0) OR
    (${table.reviewStatus} IN ('manual_review_pending', 'documented') AND jsonb_array_length(${table.paymentSnapshot}) > 0))`
    ),
    check(
      'manual_refunds_confirmation_check',
      sql`(
    ${table.reviewStatus} = 'documented' AND ${table.confirmationKey} IS NOT NULL AND
    length(btrim(${table.confirmationReason})) between 1 and 1000 AND ${table.confirmationReason} IS NOT NULL AND
    ${table.confirmedByUserId} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL) OR (
    ${table.reviewStatus} <> 'documented' AND ${table.confirmationKey} IS NULL AND
    ${table.confirmationReason} IS NULL AND ${table.confirmedByUserId} IS NULL AND ${table.confirmedAt} IS NULL)`
    ),
  ]
)

export type SelectManualRefund = typeof manualRefundsTable.$inferSelect
