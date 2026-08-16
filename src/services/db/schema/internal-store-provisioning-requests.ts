import { createdAt, updatedAt } from '@/services/db/schema/utils'
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  unique,
} from 'drizzle-orm/pg-core'
import { storeBillingInvoicesTable } from './store-billing-invoices'
import { storeSubscriptionsTable } from './store-subscriptions'
import { storesTable } from './stores'

export const internalStoreProvisioningRequestStatuses = [
  'processing',
  'succeeded',
] as const

export const internalStoreProvisioningRequestsTable = pgTable(
  'internal_store_provisioning_requests',
  {
    id: serial('id').primaryKey(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status', {
      enum: internalStoreProvisioningRequestStatuses,
    })
      .notNull()
      .default('processing'),
    actorClerkId: text('actor_clerk_id').notNull(),
    actorEmail: text('actor_email').notNull(),
    payloadHash: text('payload_hash').notNull(),
    storeId: integer('store_id').references(() => storesTable.id, {
      onDelete: 'no action',
    }),
    subscriptionId: integer('subscription_id').references(
      () => storeSubscriptionsTable.id,
      { onDelete: 'no action' }
    ),
    invoiceId: integer('invoice_id').references(
      () => storeBillingInvoicesTable.id,
      { onDelete: 'no action' }
    ),
    createdAt,
    updatedAt,
  },
  table => [
    unique('internal_store_provisioning_requests_idempotency_key_unique').on(
      table.idempotencyKey
    ),
    index('internal_store_provisioning_requests_store_idx').on(table.storeId),
  ]
)

export type InsertInternalStoreProvisioningRequest =
  typeof internalStoreProvisioningRequestsTable.$inferInsert
export type SelectInternalStoreProvisioningRequest =
  typeof internalStoreProvisioningRequestsTable.$inferSelect
