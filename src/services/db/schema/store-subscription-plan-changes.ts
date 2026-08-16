import { billingPlansTable } from '@/services/db/schema/billing-plans'
import { storesTable } from '@/services/db/schema/stores'
import { storeSubscriptionsTable } from '@/services/db/schema/store-subscriptions'
import {
  baseCurrencyColumnGenerator,
  baseTimestampColumnGenerator,
  createdAt,
  updatedAt,
} from '@/services/db/schema/utils'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const storeSubscriptionPlanChangeTimings = [
  'immediate',
  'next_renewal',
] as const

export const storeSubscriptionPlanChangeModuleTreatments = [
  'sync_to_new_plan',
  'keep_current',
  'manual_review',
] as const

export const storeSubscriptionPlanChangeStatuses = [
  'scheduled',
  'applied',
  'cancelled',
] as const

export const storeSubscriptionPlanChangesTable = pgTable(
  'store_subscription_plan_changes',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    subscriptionId: integer('subscription_id')
      .notNull()
      .references(() => storeSubscriptionsTable.id, { onDelete: 'no action' }),
    appliedSubscriptionId: integer('applied_subscription_id').references(
      () => storeSubscriptionsTable.id,
      { onDelete: 'no action' }
    ),
    fromPlanId: integer('from_plan_id')
      .notNull()
      .references(() => billingPlansTable.id, { onDelete: 'no action' }),
    toPlanId: integer('to_plan_id')
      .notNull()
      .references(() => billingPlansTable.id, { onDelete: 'no action' }),
    timing: text('timing', {
      enum: storeSubscriptionPlanChangeTimings,
    }).notNull(),
    status: text('status', {
      enum: storeSubscriptionPlanChangeStatuses,
    }).notNull(),
    moduleTreatment: text('module_treatment', {
      enum: storeSubscriptionPlanChangeModuleTreatments,
    }).notNull(),
    keepCustomAmount: boolean('keep_custom_amount').notNull(),
    previousContractedAmount: baseCurrencyColumnGenerator(
      'previous_contracted_amount'
    ).notNull(),
    nextContractedAmount:
      baseCurrencyColumnGenerator('next_contracted_amount').notNull(),
    currency: text('currency').notNull().default('BRL'),
    effectiveAt: baseTimestampColumnGenerator('effective_at').notNull(),
    appliedAt: baseTimestampColumnGenerator('applied_at'),
    cancelledAt: baseTimestampColumnGenerator('cancelled_at'),
    actorClerkId: text('actor_clerk_id').notNull(),
    actorEmail: text('actor_email').notNull(),
    reason: text('reason').notNull(),
    previousValues: jsonb('previous_values').notNull(),
    newValues: jsonb('new_values').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
    updatedAt,
  },
  table => [
    index('store_subscription_plan_changes_store_status_idx').on(
      table.storeId,
      table.status
    ),
    index('store_subscription_plan_changes_subscription_idx').on(
      table.subscriptionId
    ),
    index('store_subscription_plan_changes_effective_idx').on(
      table.effectiveAt
    ),
    index('store_subscription_plan_changes_applied_subscription_idx').on(
      table.appliedSubscriptionId
    ),
    uniqueIndex(
      'store_subscription_plan_changes_one_scheduled_per_subscription_idx'
    )
      .on(table.subscriptionId)
      .where(sql`${table.status} = 'scheduled'`),
    foreignKey({
      name: 'store_subscription_plan_changes_subscription_store_from_plan_fk',
      columns: [table.subscriptionId, table.storeId, table.fromPlanId],
      foreignColumns: [
        storeSubscriptionsTable.id,
        storeSubscriptionsTable.storeId,
        storeSubscriptionsTable.planId,
      ],
    }).onDelete('no action'),
    check(
      'store_subscription_plan_changes_plan_diff_check',
      sql`${table.fromPlanId} != ${table.toPlanId}`
    ),
    check(
      'store_subscription_plan_changes_applied_shape_check',
      sql`(${table.status} = 'applied' and ${table.appliedAt} is not null) or (${table.status} != 'applied')`
    ),
    check(
      'store_subscription_plan_changes_cancelled_shape_check',
      sql`(${table.status} = 'cancelled' and ${table.cancelledAt} is not null) or (${table.status} != 'cancelled')`
    ),
  ]
)

export type InsertStoreSubscriptionPlanChange =
  typeof storeSubscriptionPlanChangesTable.$inferInsert
export type SelectStoreSubscriptionPlanChange =
  typeof storeSubscriptionPlanChangesTable.$inferSelect
