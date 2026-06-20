import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { boolean, integer, pgTable, serial, text, unique } from 'drizzle-orm/pg-core'

export const storePaymentMethods = [
  'CASH',
  'PIX',
  'CREDIT',
  'DEBIT',
  'MEAL_VOUCHER',
  'FOOD_VOUCHER',
] as const

export const storePaymentMethodsTable = pgTable(
  'store_payment_methods',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    method: text('method', { enum: storePaymentMethods }).notNull(),
    cardBrand: text('card_brand'),
    requiresChangeFor: boolean('requires_change_for').notNull().default(false),
    instructions: text('instructions'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt,
    updatedAt,
  },
  table => [
    unique('store_payment_methods_store_method_card_brand_unique').on(
      table.storeId,
      table.method,
      table.cardBrand
    ),
  ]
)

export type InsertStorePaymentMethod = Omit<
  typeof storePaymentMethodsTable.$inferInsert,
  'id' | 'createdAt' | 'updatedAt'
>
export type SelectStorePaymentMethod = typeof storePaymentMethodsTable.$inferSelect
