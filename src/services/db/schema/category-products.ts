import { pgTable, serial, integer, boolean, text } from 'drizzle-orm/pg-core'
import { createdAt, updatedAt } from './utils'
import { categoriesTable } from './categories'
import { productsTable } from './products'

export const categoryProductsTable = pgTable('category_products', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => categoriesTable.id, { onDelete: 'cascade' }),
  productId: integer('product_id')
    .notNull()
    .references(() => productsTable.id, { onDelete: 'cascade' }),
  index: integer('index').notNull(),
  isAvailable: boolean('is_available').notNull().default(true),
  price: integer('price').notNull(),
  originalPrice: integer('original_price'),
  externalCode: text('external_code'),
  createdAt,
  updatedAt,
})

export type InsertCategoryProduct = typeof categoryProductsTable.$inferInsert
export type SelectCategoryProduct = typeof categoryProductsTable.$inferSelect
