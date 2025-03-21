import { pgTable, integer, text, primaryKey } from 'drizzle-orm/pg-core'
import { storesTable } from './store'
import { configurationsTable } from './configurations'
import { createdAt, updatedAt } from './utils'

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
