import { categoriesTable } from '@/services/db/schema/categories'
import { menuCategoriesTable } from '@/services/db/schema/menu-categories'
import { menusTable } from '@/services/db/schema/menus'
import { relations } from 'drizzle-orm'

export const menuCategoryRelations = relations(menuCategoriesTable, ({ one }) => ({
  menu: one(menusTable, {
    fields: [menuCategoriesTable.menuId],
    references: [menusTable.id],
  }),
  category: one(categoriesTable, {
    fields: [menuCategoriesTable.categoryId],
    references: [categoriesTable.id],
  }),
}))
