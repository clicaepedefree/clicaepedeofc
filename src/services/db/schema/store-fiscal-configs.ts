import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { integer, pgEnum, pgTable, serial, text } from 'drizzle-orm/pg-core'
import { storesTable } from './stores'

export const fiscalConfigStatusEnum = pgEnum('fiscal_config_status', [
  'pending_setup',
  'pending_certificate',
  'active',
  'error',
])

export const nfeioEnvironmentEnum = pgEnum('nfeio_environment', ['sandbox', 'production'])

export const taxRegimeEnum = pgEnum('tax_regime', [
  'simplesNacional',
  'simplesNacionalExcessoSublimite',
  'regimeNormal',
  'mei',
])

export const storeFiscalConfigsTable = pgTable('store_fiscal_configs', {
  id: serial('id').primaryKey(),
  storeId: integer('store_id')
    .unique()
    .notNull()
    .references(() => storesTable.id, { onDelete: 'cascade' }),

  nfeioApiKey: text('nfeio_api_key'),
  nfeioCompanyId: text('nfeio_company_id'),
  environment: nfeioEnvironmentEnum('environment').notNull().default('sandbox'),
  status: fiscalConfigStatusEnum('status').notNull().default('pending_setup'),

  federalTaxNumber: text('federal_tax_number'),
  name: text('name'),
  tradeName: text('trade_name'),
  taxRegime: taxRegimeEnum('tax_regime'),

  addressStreet: text('address_street'),
  addressNumber: text('address_number'),
  addressComplement: text('address_complement'),
  addressNeighborhood: text('address_neighborhood'),
  addressCity: text('address_city'),
  addressState: text('address_state'),
  addressPostalCode: text('address_postal_code'),
  addressCityCode: text('address_city_code'),

  email: text('email'),
  phone: text('phone'),

  stateRegistration: text('state_registration'),
  municipalRegistration: text('municipal_registration'),
  cscId: text('csc_id'),
  cscCode: text('csc_code'),
  nfceSeries: integer('nfce_series').notNull().default(1),
  nextNfceNumber: integer('next_nfce_number').notNull().default(1),
  accountantEmail: text('accountant_email'),

  certificateValidUntil: text('certificate_valid_until'),

  createdAt,
  updatedAt,
})

export type InsertStoreFiscalConfig = Omit<
  typeof storeFiscalConfigsTable.$inferInsert,
  'id' | 'createdAt' | 'updatedAt'
>
export type SelectStoreFiscalConfig = typeof storeFiscalConfigsTable.$inferSelect
