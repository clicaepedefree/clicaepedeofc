import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { integer, pgTable } from 'drizzle-orm/pg-core'
import { legalEntitiesTable } from './legal-entities'
import { storesTable } from './stores'

export const storesLegalEntityTable = pgTable('stores_legal_entity', {
  storeId: integer('store_id')
    .unique()
    .notNull()
    .references(() => storesTable.id),
  legalEntityId: integer('legal_entity_id')
    .notNull()
    .references(() => legalEntitiesTable.id),
  createdAt,
  updatedAt,
})

export type InsertStoreLegalEntity = typeof storesLegalEntityTable.$inferInsert
export type SelectStoreLegalEntity = typeof storesLegalEntityTable.$inferSelect
