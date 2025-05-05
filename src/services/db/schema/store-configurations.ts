import { configurationsTable } from '@/services/db/schema/configurations'
import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { integer, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'

export const storeConfigurationsTable = pgTable(
  'store_configurations',
  {
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    configurationId: integer('configuration_id')
      .notNull()
      .references(() => configurationsTable.id, { onDelete: 'cascade' }),
    value: text('value'),
    createdAt,
    updatedAt,
  },
  table => [primaryKey({ columns: [table.storeId, table.configurationId] })]
)

export type InsertStoreConfiguration = typeof storeConfigurationsTable.$inferInsert
export type SelectStoreConfiguration = typeof storeConfigurationsTable.$inferSelect
