import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { sql } from 'drizzle-orm'
import { check, integer, numeric, pgTable, serial, text } from 'drizzle-orm/pg-core'
import { ordersTable } from './orders'

export const orderPaymentsTable = pgTable(
  'order_payments',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => ordersTable.id),
    value: numeric('value', { precision: 19, scale: 4 }).notNull(),
    type: text('type', { enum: ['PREPAID', 'PENDING'] }).notNull(),
    method: text('method', {
      enum: ['CASH', 'PIX', 'CREDIT', 'DEBIT', 'MEAL_VOUCHER', 'FOOD_VOUCHER'],
    }).notNull(),
    changeFor: numeric('change_for', { precision: 19, scale: 4 }),
    createdAt,
    updatedAt,
  },
  table => [
    check(
      'change_for_required_for_cash',
      sql`${table.method} != 'CASH' OR (${table.changeFor} IS NULL OR ${table.changeFor} >= ${table.value})`
    ),
  ]
)

export type InsertOrderPayment = Omit<typeof orderPaymentsTable.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>
export type SelectOrderPayment = typeof orderPaymentsTable.$inferSelect
