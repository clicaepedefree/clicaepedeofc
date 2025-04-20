import { relations } from 'drizzle-orm'
import { configurationsTable } from './configurations'
import { storeConfigurationsTable } from './store-configurations'

export const configurationRelations = relations(configurationsTable, ({ many }) => ({
  storesConfigurations: many(storeConfigurationsTable),
}))
