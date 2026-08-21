import { storesTable } from '@/services/db/schema/stores'
import { storeBillingInvoicesTable } from '@/services/db/schema/store-billing-invoices'
import { storeBillingPaymentsTable } from '@/services/db/schema/store-billing-payments'
import { storeSubscriptionsTable } from '@/services/db/schema/store-subscriptions'
import {
  baseCurrencyColumnGenerator,
  baseTimestampColumnGenerator,
  createdAt,
  updatedAt,
} from '@/services/db/schema/utils'
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const storeBillingGatewayEventTypes = [
  'payment_succeeded',
  'payment_failed',
  'payment_refunded',
  'payment_cancelled',
  'unknown',
] as const

export const storeBillingGatewayEventStatuses = [
  'queued',
  'processing',
  'processed',
  'failed',
  'ignored',
] as const

export const storeBillingGatewaySignatureStatuses = [
  'valid',
  'invalid',
] as const

export const storeBillingGatewayEventsTable = pgTable(
  'store_billing_gateway_events',
  {
    id: serial('id').primaryKey(),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id').notNull(),
    eventType: text('event_type', {
      enum: storeBillingGatewayEventTypes,
    }).notNull(),
    status: text('status', {
      enum: storeBillingGatewayEventStatuses,
    })
      .notNull()
      .default('queued'),
    signatureStatus: text('signature_status', {
      enum: storeBillingGatewaySignatureStatuses,
    })
      .notNull()
      .default('valid'),
    storeId: integer('store_id').references(() => storesTable.id, {
      onDelete: 'set null',
    }),
    subscriptionId: integer('subscription_id').references(
      () => storeSubscriptionsTable.id,
      { onDelete: 'set null' }
    ),
    invoiceId: integer('invoice_id').references(
      () => storeBillingInvoicesTable.id,
      { onDelete: 'set null' }
    ),
    paymentId: integer('payment_id').references(
      () => storeBillingPaymentsTable.id,
      { onDelete: 'set null' }
    ),
    invoiceNumber: text('invoice_number'),
    providerPaymentId: text('provider_payment_id'),
    amount: baseCurrencyColumnGenerator('amount'),
    currency: text('currency').notNull().default('BRL'),
    payloadHash: text('payload_hash').notNull(),
    payload: jsonb('payload').notNull().default({}),
    headersMetadata: jsonb('headers_metadata').notNull().default({}),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: baseTimestampColumnGenerator('next_attempt_at').notNull(),
    lastError: text('last_error'),
    occurredAt: baseTimestampColumnGenerator('occurred_at'),
    processedAt: baseTimestampColumnGenerator('processed_at'),
    createdAt,
    updatedAt,
  },
  table => [
    uniqueIndex('store_billing_gateway_events_provider_event_unique').on(
      table.provider,
      table.providerEventId
    ),
    index('store_billing_gateway_events_status_next_attempt_idx').on(
      table.status,
      table.nextAttemptAt
    ),
    index('store_billing_gateway_events_invoice_idx').on(table.invoiceId),
    index('store_billing_gateway_events_payment_idx').on(table.paymentId),
    index('store_billing_gateway_events_provider_payment_idx').on(
      table.provider,
      table.providerPaymentId
    ),
    index('store_billing_gateway_events_invalid_signature_idx')
      .on(table.provider, table.createdAt)
      .where(sql`${table.signatureStatus} = 'invalid'`),
  ]
)

export type InsertStoreBillingGatewayEvent =
  typeof storeBillingGatewayEventsTable.$inferInsert
export type SelectStoreBillingGatewayEvent =
  typeof storeBillingGatewayEventsTable.$inferSelect
