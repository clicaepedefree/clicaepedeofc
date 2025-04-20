import { relations } from 'drizzle-orm'
import { storeConfigurationsTable } from './store-configurations'
import { storesTable } from './stores'
import { configurationsTable } from './configurations'

export const storeConfigurationsRelations = relations(storeConfigurationsTable, ({ one }) => ({
  store: one(storesTable, {
    fields: [storeConfigurationsTable.storeId],
    references: [storesTable.id],
  }),
  configuration: one(configurationsTable, {
    fields: [storeConfigurationsTable.configurationId],
    references: [configurationsTable.id],
  }),
}))
