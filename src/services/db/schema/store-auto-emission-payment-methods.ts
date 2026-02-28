import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { integer, pgTable, serial, text, unique } from 'drizzle-orm/pg-core'
import { storesTable } from './stores'

export const storeAutoEmissionPaymentMethodsTable = pgTable(
  'store_auto_emission_payment_methods',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    paymentMethod: text('payment_method', {
      enum: ['CASH', 'PIX', 'CREDIT', 'DEBIT', 'MEAL_VOUCHER', 'FOOD_VOUCHER'],
    }).notNull(),
    createdAt,
    updatedAt,
  },
  table => [
    unique('store_auto_emission_payment_methods_store_method_unique').on(
      table.storeId,
      table.paymentMethod
    ),
  ]
)

export type InsertStoreAutoEmissionPaymentMethod = Omit<
  typeof storeAutoEmissionPaymentMethodsTable.$inferInsert,
  'id' | 'createdAt' | 'updatedAt'
>
export type SelectStoreAutoEmissionPaymentMethod =
  typeof storeAutoEmissionPaymentMethodsTable.$inferSelect
