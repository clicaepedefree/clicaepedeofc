import { storesTable } from '@/services/db/schema/stores'
import { storeBillingInvoicesTable } from '@/services/db/schema/store-billing-invoices'
import { storeSubscriptionPlanChangesTable } from '@/services/db/schema/store-subscription-plan-changes'
import { storeSubscriptionsTable } from '@/services/db/schema/store-subscriptions'
import {
  baseCurrencyColumnGenerator,
  baseTimestampColumnGenerator,
  createdAt,
  updatedAt,
} from '@/services/db/schema/utils'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  unique,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const storeBillingAdjustmentTypes = ['debit', 'credit', 'none'] as const

export const storeBillingAdjustmentStatuses = [
  'open',
  'invoiced',
  'applied',
  'recorded',
  'waived',
  'cancelled',
] as const

export const storeBillingAdjustmentsTable = pgTable(
  'store_billing_adjustments',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    planChangeId: integer('plan_change_id')
      .notNull()
      .references(() => storeSubscriptionPlanChangesTable.id, {
        onDelete: 'no action',
      }),
    sourceSubscriptionId: integer('source_subscription_id')
      .notNull()
      .references(() => storeSubscriptionsTable.id, { onDelete: 'no action' }),
    targetSubscriptionId: integer('target_subscription_id').references(
      () => storeSubscriptionsTable.id,
      { onDelete: 'no action' }
    ),
    invoiceId: integer('invoice_id').references(
      () => storeBillingInvoicesTable.id,
      { onDelete: 'set null' }
    ),
    adjustmentType: text('adjustment_type', {
      enum: storeBillingAdjustmentTypes,
    }).notNull(),
    status: text('status', { enum: storeBillingAdjustmentStatuses })
      .notNull()
      .default('open'),
    amount: baseCurrencyColumnGenerator('amount').notNull().default('0'),
    currency: text('currency').notNull().default('BRL'),
    competenceStart:
      baseTimestampColumnGenerator('competence_start').notNull(),
    competenceEnd: baseTimestampColumnGenerator('competence_end').notNull(),
    calculationSnapshot: jsonb('calculation_snapshot').notNull(),
    reason: text('reason').notNull(),
    actorClerkId: text('actor_clerk_id').notNull(),
    actorEmail: text('actor_email').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
    updatedAt,
  },
  table => [
    unique('store_billing_adjustments_plan_change_unique').on(
      table.planChangeId
    ),
    index('store_billing_adjustments_store_status_idx').on(
      table.storeId,
      table.status
    ),
    index('store_billing_adjustments_source_subscription_idx').on(
      table.sourceSubscriptionId
    ),
    index('store_billing_adjustments_target_subscription_idx').on(
      table.targetSubscriptionId
    ),
    index('store_billing_adjustments_invoice_idx').on(table.invoiceId),
    check(
      'store_billing_adjustments_amount_non_negative_check',
      sql`${table.amount} >= 0`
    ),
    check(
      'store_billing_adjustments_competence_check',
      sql`${table.competenceEnd} >= ${table.competenceStart}`
    ),
    check(
      'store_billing_adjustments_invoice_type_check',
      sql`${table.invoiceId} is null or ${table.adjustmentType} = 'debit'`
    ),
  ]
)

export type InsertStoreBillingAdjustment =
  typeof storeBillingAdjustmentsTable.$inferInsert
export type SelectStoreBillingAdjustment =
  typeof storeBillingAdjustmentsTable.$inferSelect
