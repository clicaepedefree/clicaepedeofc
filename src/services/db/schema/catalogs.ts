import { pgTable, serial, text } from 'drizzle-orm/pg-core'

export const catalogsTable = pgTable('catalogs', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique('catalog_name_unique'),
})

export type InsertCatalog = typeof catalogsTable.$inferInsert
export type SelectCatalog = typeof catalogsTable.$inferSelect
