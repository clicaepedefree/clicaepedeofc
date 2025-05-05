import { relations } from 'drizzle-orm'
import { catalogCategoriesTable } from '@/services/db/schema/catalog-categories'
import { catalogsTable } from '@/services/db/schema/catalogs'
import { categoriesTable } from '@/services/db/schema/categories'

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
