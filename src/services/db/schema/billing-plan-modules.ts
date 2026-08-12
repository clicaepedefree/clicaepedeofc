import { billingModulesTable } from '@/services/db/schema/billing-modules'
import { billingPlansTable } from '@/services/db/schema/billing-plans'
import {
  baseTimestampColumnGenerator,
  createdAt,
  updatedAt,
} from '@/services/db/schema/utils'
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const billingPlanModuleStatuses = ['active', 'inactive'] as const

export const billingPlanModulesTable = pgTable(
  'billing_plan_modules',
  {
    id: serial('id').primaryKey(),
    planId: integer('plan_id')
      .notNull()
      .references(() => billingPlansTable.id, { onDelete: 'no action' }),
    moduleId: integer('module_id')
      .notNull()
      .references(() => billingModulesTable.id, { onDelete: 'no action' }),
    status: text('status', { enum: billingPlanModuleStatuses })
      .notNull()
      .default('active'),
    startsAt: baseTimestampColumnGenerator('starts_at').notNull().defaultNow(),
    endsAt: baseTimestampColumnGenerator('ends_at'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
    updatedAt,
  },
  table => [
    uniqueIndex('billing_plan_modules_one_active_per_plan_module_idx')
      .on(table.planId, table.moduleId)
      .where(sql`${table.status} = 'active' and ${table.endsAt} is null`),
    uniqueIndex('billing_plan_modules_id_plan_module_unique').on(
      table.id,
      table.planId,
      table.moduleId
    ),
    index('billing_plan_modules_plan_status_idx').on(
      table.planId,
      table.status
    ),
    index('billing_plan_modules_module_idx').on(table.moduleId),
    check(
      'billing_plan_modules_period_check',
      sql`${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`
    ),
  ]
)

export type InsertBillingPlanModule =
  typeof billingPlanModulesTable.$inferInsert
export type SelectBillingPlanModule =
  typeof billingPlanModulesTable.$inferSelect
