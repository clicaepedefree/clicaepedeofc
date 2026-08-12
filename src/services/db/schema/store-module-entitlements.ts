import { billingModulesTable } from '@/services/db/schema/billing-modules'
import { billingPlanModulesTable } from '@/services/db/schema/billing-plan-modules'
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

export const storeModuleEntitlementOrigins = [
  'plan',
  'addon',
  'courtesy',
  'manual',
] as const

export const storeModuleEntitlementStatuses = [
  'active',
  'inactive',
  'expired',
  'revoked',
] as const

export const storeModuleEntitlementsTable = pgTable(
  'store_module_entitlements',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    moduleId: integer('module_id')
      .notNull()
      .references(() => billingModulesTable.id, { onDelete: 'no action' }),
    subscriptionId: integer('subscription_id'),
    planId: integer('plan_id').references(() => billingPlansTable.id, {
      onDelete: 'no action',
    }),
    planModuleId: integer('plan_module_id'),
    origin: text('origin', { enum: storeModuleEntitlementOrigins }).notNull(),
    status: text('status', { enum: storeModuleEntitlementStatuses })
      .notNull()
      .default('active'),
    isAdditional: boolean('is_additional').notNull().default(false),
    additionalAmount: baseCurrencyColumnGenerator('additional_amount')
      .notNull()
      .default('0'),
    currency: text('currency').notNull().default('BRL'),
    startsAt: baseTimestampColumnGenerator('starts_at').notNull().defaultNow(),
    endsAt: baseTimestampColumnGenerator('ends_at'),
    revokedAt: baseTimestampColumnGenerator('revoked_at'),
    reason: text('reason'),
    actorClerkId: text('actor_clerk_id'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
    updatedAt,
  },
  table => [
    uniqueIndex('store_module_entitlements_one_active_per_origin_idx')
      .on(table.storeId, table.moduleId, table.origin)
      .where(sql`${table.status} = 'active' and ${table.endsAt} is null`),
    foreignKey({
      name: 'store_module_entitlements_subscription_store_plan_fk',
      columns: [table.subscriptionId, table.storeId, table.planId],
      foreignColumns: [
        storeSubscriptionsTable.id,
        storeSubscriptionsTable.storeId,
        storeSubscriptionsTable.planId,
      ],
    }).onDelete('no action'),
    foreignKey({
      name: 'store_module_entitlements_plan_module_fk',
      columns: [table.planModuleId, table.planId, table.moduleId],
      foreignColumns: [
        billingPlanModulesTable.id,
        billingPlanModulesTable.planId,
        billingPlanModulesTable.moduleId,
      ],
    }).onDelete('no action'),
    index('store_module_entitlements_store_status_idx').on(
      table.storeId,
      table.status
    ),
    index('store_module_entitlements_module_idx').on(table.moduleId),
    index('store_module_entitlements_subscription_idx').on(
      table.subscriptionId
    ),
    check(
      'store_module_entitlements_additional_shape_check',
      sql`(${table.origin} = 'addon' and ${table.isAdditional} = true) or (${table.origin} != 'addon' and ${table.isAdditional} = false and ${table.additionalAmount} = 0)`
    ),
    check(
      'store_module_entitlements_plan_shape_check',
      sql`${table.origin} != 'plan' or (${table.subscriptionId} is not null and ${table.planId} is not null and ${table.planModuleId} is not null)`
    ),
    check(
      'store_module_entitlements_period_check',
      sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`
    ),
    check(
      'store_module_entitlements_revoked_shape_check',
      sql`(${table.status} = 'revoked' and ${table.revokedAt} is not null) or (${table.status} != 'revoked')`
    ),
  ]
)

export type InsertStoreModuleEntitlement =
  typeof storeModuleEntitlementsTable.$inferInsert
export type SelectStoreModuleEntitlement =
  typeof storeModuleEntitlementsTable.$inferSelect
