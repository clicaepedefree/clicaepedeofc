import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { integer, numeric, pgTable, serial, text } from 'drizzle-orm/pg-core'
import { countersTable } from './counters'

export const ordersTable = pgTable('orders', {
  id: serial('id').primaryKey(),
  displayId: text('display_id').notNull(),
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id),
  type: text('type', { enum: ['DELIVERY', 'TAKEOUT', 'INDOOR'] }).notNull(),
  salesChannel: text('sales_channel', { enum: ['POS'] }).notNull(),
  posCounterId: integer('pos_counter_id').references(() => countersTable.id, { onDelete: 'no action' }),
  posCounterName: text('pos_counter_name'),
  status: text('status', { enum: ['PENDING', 'COMPLETED', 'CANCELLED'] }).notNull(),
  totalPrice: numeric('total_price', { precision: 19, scale: 4 }).notNull(),
  createdAt,
  updatedAt,
})

export type InsertOrder = Omit<typeof ordersTable.$inferInsert, 'createdAt' | 'updatedAt'>
export type SelectOrder = typeof ordersTable.$inferSelect

/*
TaxInvoice: {
    issued: boolean
    taxInvoiceURL: string (URL)
}

Customer: {

}
*/
