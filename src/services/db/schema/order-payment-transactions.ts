import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import {
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'
import { orderPaymentsTable } from './order-payments'

export const orderPaymentTransactionStatuses = [
  'PENDING',
  'WAITING_PAYMENT',
  'PAID',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
] as const

export const orderPaymentTransactionsTable = pgTable(
  'order_payment_transactions',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    orderPaymentId: integer('order_payment_id')
      .notNull()
      .references(() => orderPaymentsTable.id, { onDelete: 'cascade' }),
    method: text('method', { enum: ['PIX', 'ONLINE'] }).notNull(),
    provider: text('provider').notNull(),
    status: text('status', {
      enum: orderPaymentTransactionStatuses,
    }).notNull(),
    amount: numeric('amount', { precision: 19, scale: 4 }).notNull(),
    externalId: text('external_id'),
    txid: text('txid'),
    qrCode: text('qr_code'),
    copyPasteCode: text('copy_paste_code'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    providerPayload: jsonb('provider_payload').notNull().default({}),
    createdAt,
    updatedAt,
  },
  table => [
    unique('order_payment_transactions_provider_external_id_unique').on(
      table.provider,
      table.externalId
    ),
  ]
)

export type InsertOrderPaymentTransaction = Omit<
  typeof orderPaymentTransactionsTable.$inferInsert,
  'id' | 'createdAt' | 'updatedAt'
>
export type SelectOrderPaymentTransaction =
  typeof orderPaymentTransactionsTable.$inferSelect
