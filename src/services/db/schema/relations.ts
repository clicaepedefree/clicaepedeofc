import { relations } from 'drizzle-orm'
import { storesTable } from './store'
import { storeConfigurationsTable } from './store-configurations'
import { configurationsTable } from './configurations'

export const storeRelations = relations(storesTable, ({ many }) => ({
  configurations: many(storeConfigurationsTable),
}))

export const configurationRelations = relations(configurationsTable, ({ many }) => ({
  storesConfigurations: many(storeConfigurationsTable),
}))

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
