import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { jsonb, pgTable, serial, text, unique } from 'drizzle-orm/pg-core'

export const billingModuleStatuses = ['active', 'archived'] as const

export const billingModulesTable = pgTable(
  'billing_modules',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status', { enum: billingModuleStatuses })
      .notNull()
      .default('active'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
    updatedAt,
  },
  table => [unique('billing_modules_code_unique').on(table.code)]
)

export type InsertBillingModule = typeof billingModulesTable.$inferInsert
export type SelectBillingModule = typeof billingModulesTable.$inferSelect
