import {
  baseCurrencyColumnGenerator,
  createdAt,
  updatedAt,
} from '@/services/db/schema/utils'
import { integer, pgTable, serial, text, unique } from 'drizzle-orm/pg-core'

export const billingPlanStatuses = ['active', 'archived'] as const

export const billingIntervals = [
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
] as const

export const billingPlansTable = pgTable(
  'billing_plans',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status', { enum: billingPlanStatuses })
      .notNull()
      .default('active'),
    defaultAmount: baseCurrencyColumnGenerator('default_amount').notNull(),
    currency: text('currency').notNull().default('BRL'),
    billingInterval: text('billing_interval', {
      enum: billingIntervals,
    }).notNull(),
    billingIntervalCount: integer('billing_interval_count')
      .notNull()
      .default(1),
    trialDays: integer('trial_days').notNull().default(0),
    createdAt,
    updatedAt,
  },
  table => [unique('billing_plans_code_unique').on(table.code)]
)

export type InsertBillingPlan = typeof billingPlansTable.$inferInsert
export type SelectBillingPlan = typeof billingPlansTable.$inferSelect
