import { relations } from 'drizzle-orm'
import { catalogsTable } from './catalogs'
import { storeCatalogsTable } from './store-catalogs'
import { catalogCategoriesTable } from './catalog-categories'
import { catalogCategoryProductsTable } from './catalog-category-products'

export const catalogsRelations = relations(catalogsTable, ({ many }) => ({
  storeCatalogs: many(storeCatalogsTable),
  catalogCategories: many(catalogCategoriesTable),
  catalogCategoryProducts: many(catalogCategoryProductsTable),
}))
