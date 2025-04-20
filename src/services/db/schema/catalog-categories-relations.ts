import { relations } from 'drizzle-orm'
import { catalogCategoriesTable } from './catalog-categories'
import { catalogsTable } from './catalogs'
import { categoriesTable } from './categories'

export const catalogCategoryRelations = relations(catalogCategoriesTable, ({ one }) => ({
  catalog: one(catalogsTable, {
    fields: [catalogCategoriesTable.catalogId],
    references: [catalogsTable.id],
  }),
  category: one(categoriesTable, {
    fields: [catalogCategoriesTable.categoryId],
    references: [categoriesTable.id],
  }),
}))
