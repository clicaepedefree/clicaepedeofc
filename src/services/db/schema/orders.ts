import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { isNotNull } from 'drizzle-orm'
import {
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { countersTable } from './counters'

export const orderSalesChannels = ['POS', 'DIGITAL_MENU'] as const

export const orderStatuses = [
  'PENDING',
  'COMPLETED',
  'CANCELLED',
  'CREATED',
  'SENT_TO_STORE',
  'RECEIVED',
  'ACCEPTED',
  'REJECTED',
] as const

export const ordersTable = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    displayId: text('display_id').notNull(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id),
    type: text('type', { enum: ['DELIVERY', 'TAKEOUT', 'INDOOR'] }).notNull(),
    salesChannel: text('sales_channel', { enum: orderSalesChannels }).notNull(),
    posCounterId: integer('pos_counter_id').references(() => countersTable.id, { onDelete: 'no action' }),
    posCounterName: text('pos_counter_name'),
    status: text('status', { enum: orderStatuses }).notNull(),
    totalPrice: numeric('total_price', { precision: 19, scale: 4 }).notNull(),
    customerName: text('customer_name'),
    customerPhone: text('customer_phone'),
    customerDocument: text('customer_document'),
    deliveryAddress: text('delivery_address'),
    deliveryAddressReference: text('delivery_address_reference'),
    deliveryNeighborhood: text('delivery_neighborhood'),
    deliveryFee: numeric('delivery_fee', { precision: 19, scale: 4 }),
    couponCode: text('coupon_code'),
    origin: text('origin'),
    idempotencyKey: text('idempotency_key'),
    requestId: text('request_id'),
    snapshot: jsonb('snapshot'),
    technicalAckAt: timestamp('technical_ack_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  table => [
    uniqueIndex('orders_store_id_idempotency_key_unique')
      .on(table.storeId, table.idempotencyKey)
      .where(isNotNull(table.idempotencyKey)),
  ]
)

export type InsertOrder = Omit<typeof ordersTable.$inferInsert, 'createdAt' | 'updatedAt'>
export type SelectOrder = typeof ordersTable.$inferSelect

/*
TaxInvoice: {
    issued: boolean
    taxInvoiceURL: string (URL)
}

Customer: {

}
*/
