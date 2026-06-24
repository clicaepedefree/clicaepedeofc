import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { integer, pgTable, text } from 'drizzle-orm/pg-core'

export const storeCompanyProfilesTable = pgTable('store_company_profiles', {
  storeId: integer('store_id')
    .primaryKey()
    .references(() => storesTable.id, { onDelete: 'cascade' }),
  companyTaxNumber: text('company_tax_number'),
  companyName: text('company_name'),
  phone1: text('phone_1'),
  phone2: text('phone_2'),
  email: text('email'),
  responsibleName: text('responsible_name'),
  responsibleTaxNumber: text('responsible_tax_number'),
  responsiblePhone: text('responsible_phone'),
  responsibleEmail: text('responsible_email'),
  postalCode: text('postal_code'),
  street: text('street'),
  number: text('number'),
  district: text('district'),
  city: text('city'),
  stateCode: text('state_code'),
  createdAt,
  updatedAt,
})

export type InsertStoreCompanyProfile = Omit<
  typeof storeCompanyProfilesTable.$inferInsert,
  'createdAt' | 'updatedAt'
>
export type SelectStoreCompanyProfile =
  typeof storeCompanyProfilesTable.$inferSelect
