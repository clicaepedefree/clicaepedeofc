import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { storesTable } from './stores'
import { ordersTable } from './orders'
import { storeBenefitProgramVersionsTable as versions } from './store-benefit-program-versions'

const money = (name: string) =>
  numeric(name, { precision: 19, scale: 2 }).notNull().default('0.00')
const instant = (name: string) =>
  timestamp(name, { withTimezone: true })
    .notNull()
    .default(sql`clock_timestamp()`)

export const benefitAccountsTable = pgTable(
  'benefit_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'restrict' }),
    phone: text('phone').notNull(),
    adjustmentDebt: money('adjustment_debt'),
    createdAt: instant('created_at'),
  },
  t => [
    unique('benefit_account_store_phone').on(t.storeId, t.phone),
    check('benefit_account_finite', sql`${t.adjustmentDebt}::text <> 'NaN'`),
    unique('benefit_account_scope').on(t.id, t.storeId),
    check('benefit_account_debt', sql`${t.adjustmentDebt} >= 0`),
    check(
      'benefit_account_phone',
      sql`${t.phone} ~ '^55[1-9][0-9](9[0-9]{8}|[2-5][0-9]{7})$'`
    ),
  ]
)

export const benefitCapturesTable = pgTable(
  'benefit_captures',
  {
    orderId: integer('order_id').primaryKey(),
    storeId: integer('store_id').notNull(),
    accountId: uuid('account_id').notNull(),
    ruleVersion: integer('rule_version').notNull(),
    baseAmount: money('base_amount'),
    cashbackSpent: money('cashback_spent'),
    cashbackEnabled: boolean('cashback_enabled').notNull(),
    loyaltyEnabled: boolean('loyalty_enabled').notNull(),
    createdAt: instant('created_at'),
  },
  t => [
    unique('benefit_capture_scope').on(t.orderId, t.accountId, t.storeId),
    check('benefit_capture_finite', sql`${t.baseAmount}::text <> 'NaN' and ${t.cashbackSpent}::text <> 'NaN'`),
    foreignKey({
      columns: [t.orderId, t.storeId],
      foreignColumns: [ordersTable.id, ordersTable.storeId],
    }),
    foreignKey({
      columns: [t.accountId, t.storeId],
      foreignColumns: [benefitAccountsTable.id, benefitAccountsTable.storeId],
    }),
    foreignKey({
      columns: [t.storeId, t.ruleVersion],
      foreignColumns: [versions.storeId, versions.version],
    }),
    check(
      'benefit_capture_amounts',
      sql`${t.baseAmount} >= 0 and ${t.cashbackSpent} >= 0`
    ),
  ]
)

export const benefitCyclesTable = pgTable(
  'benefit_cycles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: integer('store_id').notNull(),
    accountId: uuid('account_id').notNull(),
    ruleVersion: integer('rule_version').notNull(),
    createdAt: instant('created_at'),
  },
  t => [
    unique('benefit_cycle_scope').on(t.id, t.accountId, t.storeId),
    foreignKey({
      columns: [t.accountId, t.storeId],
      foreignColumns: [benefitAccountsTable.id, benefitAccountsTable.storeId],
    }),
    foreignKey({
      columns: [t.storeId, t.ruleVersion],
      foreignColumns: [versions.storeId, versions.version],
    }),
  ]
)

export const benefitGrantsTable = pgTable(
  'benefit_grants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: integer('store_id').notNull(),
    accountId: uuid('account_id').notNull(),
    orderId: integer('order_id').notNull(),
    ruleVersion: integer('rule_version').notNull(),
    kind: text('kind', { enum: ['cashback', 'loyalty', 'reward'] }).notNull(),
    cycleId: uuid('cycle_id'),
    amount: money('amount'),
    validityDays: integer('validity_days').notNull(),
    rewardItemId: integer('reward_item_id'),
    rewardItemName: text('reward_item_name'),
    state: text('state', { enum: ['pending', 'confirmed', 'reversed'] })
      .notNull()
      .default('pending'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: instant('created_at'),
  },
  t => [
    uniqueIndex('benefit_grant_order_kind')
      .on(t.orderId, t.kind)
      .where(sql`${t.kind} <> 'reward'`),
    uniqueIndex('benefit_grant_cycle_reward')
      .on(t.cycleId)
      .where(sql`${t.kind} = 'reward'`),
    index('benefit_grant_account_state').on(t.accountId, t.state),
    index('benefit_grant_cycle').on(t.cycleId, t.kind, t.state),
    unique('benefit_grant_scope').on(t.id, t.accountId, t.storeId),
    check('benefit_grant_finite', sql`${t.amount}::text <> 'NaN'`),
    foreignKey({
      columns: [t.orderId, t.accountId, t.storeId],
      foreignColumns: [
        benefitCapturesTable.orderId,
        benefitCapturesTable.accountId,
        benefitCapturesTable.storeId,
      ],
    }),
    foreignKey({
      columns: [t.cycleId, t.accountId, t.storeId],
      foreignColumns: [
        benefitCyclesTable.id,
        benefitCyclesTable.accountId,
        benefitCyclesTable.storeId,
      ],
    }),
    foreignKey({
      columns: [t.storeId, t.ruleVersion],
      foreignColumns: [versions.storeId, versions.version],
    }),
    check(
      'benefit_grant_amount',
      sql`${t.amount} >= 0 and ${t.validityDays} > 0`
    ),
    check(
      'benefit_grant_shape',
      sql`(${t.kind} = 'cashback' and ${t.cycleId} is null and ${t.rewardItemId} is null) or (${t.kind} = 'loyalty' and ${t.cycleId} is not null and ${t.amount} = 0 and ${t.rewardItemId} is null) or (${t.kind} = 'reward' and ${t.cycleId} is not null)`
    ),
    check(
      'benefit_grant_state',
      sql`${t.state} in ('pending','confirmed','reversed')`
    ),
    check(
      'benefit_grant_confirmation',
      sql`(${t.confirmedAt} is null and ${t.expiresAt} is null and ${t.state} <> 'confirmed') or (${t.confirmedAt} is not null and ${t.expiresAt} is not null and ${t.expiresAt} > ${t.confirmedAt})`
    ),
    check(
      'benefit_grant_product',
      sql`${t.rewardItemId} is null or (${t.kind} = 'reward' and ${t.amount} = 0 and ${t.rewardItemName} is not null)`
    ),
  ]
)

export const benefitLotsTable = pgTable(
  'benefit_lots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: integer('store_id').notNull(),
    accountId: uuid('account_id').notNull(),
    grantId: uuid('grant_id'),
    sourceKey: text('source_key').notNull(),
    originalAmount: money('original_amount'),
    remainingAmount: money('remaining_amount'),
    spentAmount: money('spent_amount'),
    expiredAmount: money('expired_amount'),
    offsetAmount: money('offset_amount'),
    revokedAmount: money('revoked_amount'),
    refundedAmount: money('refunded_amount'),
    frozen: boolean('frozen').notNull().default(false),
    reversed: boolean('reversed').notNull().default(false),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: instant('created_at'),
  },
  t => [
    unique('benefit_lot_source').on(t.accountId, t.sourceKey),
    check('benefit_lot_finite', sql`${t.originalAmount}::text <> 'NaN'`),
    unique('benefit_lot_scope').on(t.id, t.accountId, t.storeId),
    index('benefit_lot_account_expiry').on(
      t.accountId,
      t.expiresAt,
      t.createdAt,
      t.id
    ),
    index('benefit_lot_grant').on(t.grantId),
    foreignKey({
      columns: [t.accountId, t.storeId],
      foreignColumns: [benefitAccountsTable.id, benefitAccountsTable.storeId],
    }),
    foreignKey({
      columns: [t.grantId, t.accountId, t.storeId],
      foreignColumns: [
        benefitGrantsTable.id,
        benefitGrantsTable.accountId,
        benefitGrantsTable.storeId,
      ],
    }),
    check(
      'benefit_lot_conservation',
      sql`${t.originalAmount} > 0 and ${t.remainingAmount} >= 0 and ${t.spentAmount} >= 0 and ${t.expiredAmount} >= 0 and ${t.offsetAmount} >= 0 and ${t.revokedAmount} >= 0 and ${t.refundedAmount} >= 0 and ${t.originalAmount} = ${t.remainingAmount} + ${t.spentAmount} + ${t.expiredAmount} + ${t.offsetAmount} + ${t.revokedAmount} + ${t.refundedAmount}`
    ),
    check(
      'benefit_lot_reversed',
      sql`not ${t.reversed} or ${t.remainingAmount} = 0`
    ),
  ]
)

export const benefitDebitsTable = pgTable(
  'benefit_debits',
  {
    orderId: integer('order_id').primaryKey(),
    storeId: integer('store_id').notNull(),
    accountId: uuid('account_id').notNull(),
    amount: money('amount'),
    createdAt: instant('created_at'),
  },
  t => [
    unique('benefit_debit_scope').on(t.orderId, t.accountId, t.storeId),
    check('benefit_debit_finite', sql`${t.amount}::text <> 'NaN'`),
    foreignKey({
      columns: [t.accountId, t.storeId],
      foreignColumns: [benefitAccountsTable.id, benefitAccountsTable.storeId],
    }),
    foreignKey({
      columns: [t.orderId, t.storeId],
      foreignColumns: [ordersTable.id, ordersTable.storeId],
    }),
    check('benefit_debit_amount', sql`${t.amount} > 0`),
  ]
)

export const benefitAllocationsTable = pgTable(
  'benefit_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: integer('store_id').notNull(),
    accountId: uuid('account_id').notNull(),
    orderId: integer('order_id').notNull(),
    lotId: uuid('lot_id').notNull(),
    amount: money('amount'),
    createdAt: instant('created_at'),
  },
  t => [
    unique('benefit_allocation_order_lot').on(t.orderId, t.lotId),
    check('benefit_allocation_finite', sql`${t.amount}::text <> 'NaN'`),
    foreignKey({
      columns: [t.accountId, t.storeId],
      foreignColumns: [benefitAccountsTable.id, benefitAccountsTable.storeId],
    }),
    foreignKey({
      columns: [t.orderId, t.accountId, t.storeId],
      foreignColumns: [
        benefitDebitsTable.orderId,
        benefitDebitsTable.accountId,
        benefitDebitsTable.storeId,
      ],
    }),
    foreignKey({
      columns: [t.lotId, t.accountId, t.storeId],
      foreignColumns: [
        benefitLotsTable.id,
        benefitLotsTable.accountId,
        benefitLotsTable.storeId,
      ],
    }),
    check('benefit_allocation_amount', sql`${t.amount} > 0`),
  ]
)

export const benefitEventsTable = pgTable(
  'benefit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: integer('store_id').notNull(),
    accountId: uuid('account_id').notNull(),
    orderId: integer('order_id'),
    grantId: uuid('grant_id'),
    lotId: uuid('lot_id'),
    eventKey: text('event_key').notNull(),
    type: text('type').notNull(),
    amount: money('amount'),
    debtDelta: money('debt_delta'),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: instant('created_at'),
  },
  t => [
    unique('benefit_event_idempotency').on(t.accountId, t.eventKey),
    check('benefit_event_finite', sql`${t.amount}::text <> 'NaN' and ${t.debtDelta}::text <> 'NaN'`),
    index('benefit_event_order').on(t.orderId, t.storeId),
    foreignKey({
      columns: [t.accountId, t.storeId],
      foreignColumns: [benefitAccountsTable.id, benefitAccountsTable.storeId],
    }),
    foreignKey({
      columns: [t.orderId, t.storeId],
      foreignColumns: [ordersTable.id, ordersTable.storeId],
    }),
    foreignKey({
      columns: [t.grantId, t.accountId, t.storeId],
      foreignColumns: [
        benefitGrantsTable.id,
        benefitGrantsTable.accountId,
        benefitGrantsTable.storeId,
      ],
    }),
    foreignKey({
      columns: [t.lotId, t.accountId, t.storeId],
      foreignColumns: [
        benefitLotsTable.id,
        benefitLotsTable.accountId,
        benefitLotsTable.storeId,
      ],
    }),
  ]
)

export const benefitProductRedemptionsTable = pgTable(
  'benefit_product_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    storeId: integer('store_id').notNull(),
    accountId: uuid('account_id').notNull(),
    grantId: uuid('grant_id').notNull(),
    orderId: integer('order_id').notNull(),
    itemId: integer('item_id').notNull(),
    itemName: text('item_name').notNull(),
    originalExpiresAt: timestamp('original_expires_at', {
      withTimezone: true,
    }).notNull(),
    state: text('state', { enum: ['reserved', 'completed', 'refunded'] })
      .notNull()
      .default('reserved'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    createdAt: instant('created_at'),
  },
  t => [
    unique('benefit_product_redemption_order').on(t.orderId),
    uniqueIndex('benefit_product_redemption_active')
      .on(t.grantId)
      .where(sql`${t.state} <> 'refunded'`),
    index('benefit_product_redemption_history').on(t.accountId, t.createdAt, t.id),
    foreignKey({
      columns: [t.grantId, t.accountId, t.storeId],
      foreignColumns: [
        benefitGrantsTable.id,
        benefitGrantsTable.accountId,
        benefitGrantsTable.storeId,
      ],
    }),
    foreignKey({
      columns: [t.orderId, t.storeId],
      foreignColumns: [ordersTable.id, ordersTable.storeId],
    }),
    check(
      'benefit_product_redemption_state',
      sql`${t.state} in ('reserved','completed','refunded')`
    ),
    check('benefit_product_redemption_times', sql`
      ${t.originalExpiresAt} > ${t.createdAt}
      and (${t.completedAt} is null or ${t.completedAt} >= ${t.createdAt})
      and (${t.refundedAt} is null or ${t.refundedAt} >= coalesce(${t.completedAt}, ${t.createdAt}))
      and ((${t.state} = 'reserved' and ${t.completedAt} is null and ${t.refundedAt} is null)
        or (${t.state} = 'completed' and ${t.completedAt} is not null and ${t.refundedAt} is null)
        or (${t.state} = 'refunded' and ${t.refundedAt} is not null))`),
  ]
)
