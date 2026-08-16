import {
  billingIntervals,
  billingPlansTable,
} from '@/services/db/schema/billing-plans'
import { storesTable } from '@/services/db/schema/stores'
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

export const storeSubscriptionStatuses = [
  'trialing',
  'active',
  'past_due',
  'paused',
  'canceled',
] as const

export const storeSubscriptionDiscountTypes = [
  'fixed_amount',
  'percentage',
] as const

export const storeSubscriptionsTable = pgTable(
  'store_subscriptions',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    planId: integer('plan_id')
      .notNull()
      .references(() => billingPlansTable.id, { onDelete: 'no action' }),
    status: text('status', { enum: storeSubscriptionStatuses })
      .notNull()
      .default('active'),
    contractedAmount:
      baseCurrencyColumnGenerator('contracted_amount').notNull(),
    currency: text('currency').notNull().default('BRL'),
    billingInterval: text('billing_interval', {
      enum: billingIntervals,
    }).notNull(),
    billingIntervalCount: integer('billing_interval_count')
      .notNull()
      .default(1),
    discountType: text('discount_type', {
      enum: storeSubscriptionDiscountTypes,
    }),
    discountValue: baseCurrencyColumnGenerator('discount_value'),
    discountValidUntil: baseTimestampColumnGenerator('discount_valid_until'),
    paymentGraceDays: integer('payment_grace_days').notNull().default(0),
    startsAt: baseTimestampColumnGenerator('starts_at').notNull(),
    currentPeriodStart: baseTimestampColumnGenerator(
      'current_period_start'
    ).notNull(),
    currentPeriodEnd:
      baseTimestampColumnGenerator('current_period_end').notNull(),
    nextBillingAt: baseTimestampColumnGenerator('next_billing_at').notNull(),
    canceledAt: baseTimestampColumnGenerator('canceled_at'),
    cancellationReason: text('cancellation_reason'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
    updatedAt,
  },
  table => [
    index('store_subscriptions_store_status_idx').on(
      table.storeId,
      table.status
    ),
    index('store_subscriptions_next_billing_idx').on(table.nextBillingAt),
    uniqueIndex('store_subscriptions_one_open_per_store_idx')
      .on(table.storeId)
      .where(
        sql`${table.status} in ('trialing', 'active', 'past_due', 'paused')`
      ),
    uniqueIndex('store_subscriptions_id_store_plan_unique').on(
      table.id,
      table.storeId,
      table.planId
    ),
  ]
)

export type InsertStoreSubscription =
  typeof storeSubscriptionsTable.$inferInsert
export type SelectStoreSubscription =
  typeof storeSubscriptionsTable.$inferSelect
