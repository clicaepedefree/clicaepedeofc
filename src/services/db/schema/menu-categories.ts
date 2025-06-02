import { categoriesTable } from '@/services/db/schema/categories'
import { menusTable } from '@/services/db/schema/menus'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { boolean, integer, pgTable, serial } from 'drizzle-orm/pg-core'

export const menuCategoriesTable = pgTable('menu_categories', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => categoriesTable.id, { onDelete: 'cascade' }),
  menuId: integer('menu_id')
    .notNull()
    .references(() => menusTable.id, { onDelete: 'cascade' }),
  index: integer('index'),
  isAvailable: boolean('is_available'),
  createdAt,
  updatedAt,
})

export type InsertMenuCategory = typeof menuCategoriesTable.$inferInsert
export type SelectMenuCategory = typeof menuCategoriesTable.$inferSelect
