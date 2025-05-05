import { configurationsTable } from '@/services/db/schema/configurations'
import { storeConfigurationsTable } from '@/services/db/schema/store-configurations'
import { relations } from 'drizzle-orm'

export const configurationRelations = relations(configurationsTable, ({ many }) => ({
  storesConfigurations: many(storeConfigurationsTable),
}))
