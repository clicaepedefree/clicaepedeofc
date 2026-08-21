import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import {
  index,
  integer,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const billingReminderChannels = ['email', 'whatsapp', 'system'] as const

export const billingReminderRuleStatuses = ['active', 'inactive'] as const

export const billingReminderRulesTable = pgTable(
  'billing_reminder_rules',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id').references(() => storesTable.id, {
      onDelete: 'cascade',
    }),
    channel: text('channel', { enum: billingReminderChannels }).notNull(),
    daysAfterDue: integer('days_after_due').notNull(),
    status: text('status', { enum: billingReminderRuleStatuses })
      .notNull()
      .default('active'),
    title: text('title').notNull(),
    messageTemplate: text('message_template'),
    createdAt,
    updatedAt,
  },
  table => [
    uniqueIndex('billing_reminder_rules_global_unique')
      .on(table.channel, table.daysAfterDue)
      .where(sql`${table.storeId} is null`),
    uniqueIndex('billing_reminder_rules_store_unique')
      .on(table.storeId, table.channel, table.daysAfterDue)
      .where(sql`${table.storeId} is not null`),
    index('billing_reminder_rules_store_status_idx').on(
      table.storeId,
      table.status
    ),
  ]
)

export type InsertBillingReminderRule =
  typeof billingReminderRulesTable.$inferInsert
export type SelectBillingReminderRule =
  typeof billingReminderRulesTable.$inferSelect
