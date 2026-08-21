import { storesTable } from '@/services/db/schema/stores'
import { storeBillingGatewayEventsTable } from '@/services/db/schema/store-billing-gateway-events'
import { storeBillingInvoicesTable } from '@/services/db/schema/store-billing-invoices'
import { storeBillingPaymentsTable } from '@/services/db/schema/store-billing-payments'
import {
  baseTimestampColumnGenerator,
  createdAt,
  updatedAt,
} from '@/services/db/schema/utils'
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
} from 'drizzle-orm/pg-core'

export const storeBillingReconciliationIssueTypes = [
  'invalid_signature',
  'invalid_origin',
  'unsupported_event',
  'invoice_not_found',
  'amount_mismatch',
  'payment_exceeds_outstanding',
  'refund_exceeds_paid',
  'out_of_order_event',
  'invoice_payment_total_mismatch',
  'processing_error',
] as const

export const storeBillingReconciliationIssueStatuses = [
  'open',
  'resolved',
  'ignored',
] as const

export const storeBillingReconciliationIssueSeverities = [
  'info',
  'warning',
  'critical',
] as const

export const storeBillingReconciliationIssuesTable = pgTable(
  'store_billing_reconciliation_issues',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').references(() => storesTable.id, {
      onDelete: 'set null',
    }),
    invoiceId: integer('invoice_id').references(
      () => storeBillingInvoicesTable.id,
      { onDelete: 'set null' }
    ),
    paymentId: integer('payment_id').references(
      () => storeBillingPaymentsTable.id,
      { onDelete: 'set null' }
    ),
    gatewayEventId: integer('gateway_event_id').references(
      () => storeBillingGatewayEventsTable.id,
      { onDelete: 'set null' }
    ),
    provider: text('provider').notNull(),
    providerEventId: text('provider_event_id'),
    issueType: text('issue_type', {
      enum: storeBillingReconciliationIssueTypes,
    }).notNull(),
    status: text('status', {
      enum: storeBillingReconciliationIssueStatuses,
    })
      .notNull()
      .default('open'),
    severity: text('severity', {
      enum: storeBillingReconciliationIssueSeverities,
    })
      .notNull()
      .default('warning'),
    reason: text('reason').notNull(),
    expectedValues: jsonb('expected_values'),
    observedValues: jsonb('observed_values'),
    resolvedAt: baseTimestampColumnGenerator('resolved_at'),
    createdAt,
    updatedAt,
  },
  table => [
    index('store_billing_reconciliation_issues_status_idx').on(
      table.status,
      table.createdAt
    ),
    index('store_billing_reconciliation_issues_store_idx').on(
      table.storeId,
      table.status
    ),
    index('store_billing_reconciliation_issues_invoice_idx').on(
      table.invoiceId
    ),
    index('store_billing_reconciliation_issues_gateway_event_idx').on(
      table.gatewayEventId
    ),
  ]
)

export type InsertStoreBillingReconciliationIssue =
  typeof storeBillingReconciliationIssuesTable.$inferInsert
export type SelectStoreBillingReconciliationIssue =
  typeof storeBillingReconciliationIssuesTable.$inferSelect
