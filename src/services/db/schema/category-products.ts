import { categoriesTable } from '@/services/db/schema/categories'
import { productsTable } from '@/services/db/schema/products'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { boolean, integer, numeric, pgTable, serial, text } from 'drizzle-orm/pg-core'

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
  price: numeric('price', { precision: 19, scale: 4 }).notNull(),
  originalPrice: numeric('original_price', { precision: 19, scale: 4 }),
  externalCode: text('external_code'),
  createdAt,
  updatedAt,
})

export type InsertCategoryProduct = Omit<typeof categoryProductsTable.$inferInsert, 'createdAt' | 'updatedAt'>
export type SelectCategoryProduct = typeof categoryProductsTable.$inferSelect
