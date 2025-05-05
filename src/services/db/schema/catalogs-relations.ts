import { relations } from 'drizzle-orm'
import { catalogsTable } from '@/services/db/schema/catalogs'
import { storeCatalogsTable } from '@/services/db/schema/store-catalogs'
import { catalogCategoriesTable } from '@/services/db/schema/catalog-categories'
import { catalogCategoryProductsTable } from '@/services/db/schema/catalog-category-products'

export const catalogsRelations = relations(catalogsTable, ({ many }) => ({
  storeCatalogs: many(storeCatalogsTable),
  catalogCategories: many(catalogCategoriesTable),
  catalogCategoryProducts: many(catalogCategoryProductsTable),
}))
