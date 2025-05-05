import { configurationsTable } from '@/services/db/schema/configurations'
import { storeConfigurationsTable } from '@/services/db/schema/store-configurations'
import { storesTable } from '@/services/db/schema/stores'
import { relations } from 'drizzle-orm'

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
