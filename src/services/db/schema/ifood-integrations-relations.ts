import { ifoodIntegrationsTable } from '@/services/db/schema/ifood-integrations'
import { storesTable } from '@/services/db/schema/stores'
import { relations } from 'drizzle-orm'

export const ifoodIntegrationsRelations = relations(ifoodIntegrationsTable, ({ one }) => ({
  store: one(storesTable, {
    fields: [ifoodIntegrationsTable.storeId],
    references: [storesTable.id],
  }),
}))
