import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { boolean, integer, pgTable, serial, text } from 'drizzle-orm/pg-core'

export const cashiersTable = pgTable('cashiers', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .notNull()
    .references(() => storesTable.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  isAvailable: boolean('is_available'),
  createdAt,
  updatedAt,
})
