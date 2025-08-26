import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { char, pgTable, serial, text, uuid } from 'drizzle-orm/pg-core'
import { usersTable } from './users'

export const legalEntitiesTable = pgTable('legal_entities', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  tradeName: text('trade_name').notNull(), // Nome fantasia
  federalTaxNumber: text('federal_tax_number').unique().notNull(), // CNPJ
  taxRegime: text('tax_regime').notNull(),
  postalCode: text('postal_code').notNull(),
  street: text('street').notNull(),
  number: text('number').notNull(),
  complement: text('complement'),
  district: text('district').notNull(),
  cityName: text('city_name').notNull(),
  cityCode: text('city_code').notNull(),
  stateCode: char('state_code', { length: 2 }).notNull(), // ISO 3166-2 ALFA 2
  countryCode: char('country_code', { length: 3 }).notNull(), // ISO 3166-1 ALFA-3
  createdBy: uuid('created_by').references(() => usersTable.id, {
    onDelete: 'no action',
  }),
  createdAt,
  updatedAt,
})

export type InsertLegalEntity = Omit<
  typeof legalEntitiesTable.$inferInsert,
  'id' | 'createdAt' | 'updatedAt'
>
export type SelectLegalEntity = typeof legalEntitiesTable.$inferSelect
