import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { storesTable } from './stores'
import { usersTable } from './users'

// KAN-152 must pin (store_id, version) at order creation, never read latest
// when granting/reversing benefits. This table contains configuration only.
export const storeBenefitProgramVersionsTable = pgTable(
  'store_benefit_program_versions',
  {
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'restrict' }),
    version: integer('version').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    cashbackEnabled: boolean('cashback_enabled').notNull(),
    cashbackPercentage: text('cashback_percentage'),
    cashbackExpiresAfterDays: integer('cashback_expires_after_days'),
    cashbackMinimumOrderAmount: text('cashback_minimum_order_amount'),
    loyaltyEnabled: boolean('loyalty_enabled').notNull(),
    loyaltyRequiredOrders: integer('loyalty_required_orders'),
    loyaltyMinimumOrderAmount: text('loyalty_minimum_order_amount'),
    loyaltyRewardType: text('loyalty_reward_type', {
      enum: ['cashback', 'product'],
    }),
    loyaltyRewardAmount: text('loyalty_reward_amount'),
    loyaltyRewardItemId: integer('loyalty_reward_item_id'),
    loyaltyRewardItemName: text('loyalty_reward_item_name'),
    loyaltyRewardExpiresAfterDays: integer('loyalty_reward_expires_after_days'),
  },
  table => [
    primaryKey({ columns: [table.storeId, table.version] }),
    // Product identity/name are historical snapshots, not catalog references.
    // The INSERT trigger checks ownership under lock without blocking later deletion.
    check('benefit_version_positive', sql`${table.version} > 0`),
    check(
      'benefit_percentage',
      sql`${table.cashbackPercentage} is null or (${table.cashbackPercentage} ~ '^(0|[1-9][0-9]{0,2})([.][0-9]{1,2})?$' and ${table.cashbackPercentage}::numeric > 0 and ${table.cashbackPercentage}::numeric <= 100)`
    ),
    check(
      'benefit_cashback_money',
      sql`${table.cashbackMinimumOrderAmount} is null or ${table.cashbackMinimumOrderAmount} ~ '^(0|[1-9][0-9]{0,9})([.][0-9]{1,2})?$'`
    ),
    check(
      'benefit_loyalty_money',
      sql`${table.loyaltyMinimumOrderAmount} is null or ${table.loyaltyMinimumOrderAmount} ~ '^(0|[1-9][0-9]{0,9})([.][0-9]{1,2})?$'`
    ),
    check(
      'benefit_reward_money',
      sql`${table.loyaltyRewardAmount} is null or (${table.loyaltyRewardAmount} ~ '^(0|[1-9][0-9]{0,9})([.][0-9]{1,2})?$' and ${table.loyaltyRewardAmount}::numeric > 0)`
    ),
    check(
      'benefit_positive_counts',
      sql`(${table.cashbackExpiresAfterDays} is null or ${table.cashbackExpiresAfterDays} > 0) and (${table.loyaltyRequiredOrders} is null or ${table.loyaltyRequiredOrders} > 0) and (${table.loyaltyRewardExpiresAfterDays} is null or ${table.loyaltyRewardExpiresAfterDays} > 0) and (${table.loyaltyRewardItemId} is null or ${table.loyaltyRewardItemId} > 0)`
    ),
    check(
      'benefit_cashback_required',
      sql`not ${table.cashbackEnabled} or (${table.cashbackPercentage} is not null and ${table.cashbackExpiresAfterDays} is not null and ${table.cashbackMinimumOrderAmount} is not null)`
    ),
    check(
      'benefit_reward_shape',
      sql`(${table.loyaltyRewardType} is null and ${table.loyaltyRewardAmount} is null and ${table.loyaltyRewardItemId} is null) or (${table.loyaltyRewardType} = 'cashback' and ${table.loyaltyRewardType} is not null and ${table.loyaltyRewardItemId} is null) or (${table.loyaltyRewardType} = 'product' and ${table.loyaltyRewardType} is not null and ${table.loyaltyRewardAmount} is null)`
    ),
    check(
      'benefit_loyalty_required',
      sql`not ${table.loyaltyEnabled} or (${table.loyaltyRequiredOrders} is not null and ${table.loyaltyMinimumOrderAmount} is not null and ${table.loyaltyRewardExpiresAfterDays} is not null and ${table.loyaltyRewardType} is not null and ((${table.loyaltyRewardType} = 'cashback' and ${table.loyaltyRewardAmount} is not null) or (${table.loyaltyRewardType} = 'product' and ${table.loyaltyRewardItemId} is not null)))`
    ),
  ]
)

export type SelectStoreBenefitProgramVersion =
  typeof storeBenefitProgramVersionsTable.$inferSelect
