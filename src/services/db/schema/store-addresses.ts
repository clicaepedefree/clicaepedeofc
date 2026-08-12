import { sql } from 'drizzle-orm'
import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const storeAddressTypes = [
  'business',
  'billing',
  'pickup',
  'delivery_origin',
] as const

export const storeAddressesTable = pgTable(
  'store_addresses',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    addressType: text('address_type', { enum: storeAddressTypes })
      .notNull()
      .default('business'),
    label: text('label'),
    postalCode: text('postal_code'),
    street: text('street'),
    number: text('number'),
    complement: text('complement'),
    district: text('district'),
    city: text('city'),
    stateCode: text('state_code'),
    reference: text('reference'),
    isPrimary: boolean('is_primary').notNull().default(true),
    createdAt,
    updatedAt,
  },
  table => [
    index('store_addresses_store_id_idx').on(table.storeId),
    uniqueIndex('store_addresses_one_primary_per_type_idx')
      .on(table.storeId, table.addressType)
      .where(sql`${table.isPrimary} = true`),
  ]
)

export type InsertStoreAddress = typeof storeAddressesTable.$inferInsert
export type SelectStoreAddress = typeof storeAddressesTable.$inferSelect
