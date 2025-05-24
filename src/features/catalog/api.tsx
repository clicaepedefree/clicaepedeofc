'use server'

import {
  createCategoryOnDb,
  createCategoryProductOnDb,
  createProductOnDb,
  getNextCategoryIndex,
  getNextCategoryProductIndex,
  updateCategoryOnDb,
  updateProductOnDb,
} from '@/features/catalog/db'
import { NewCategory, NewProduct } from '@/features/catalog/types'
import { db } from '@/services/db'
import { categoriesTable, InsertCategory } from '@/services/db/schema/categories'
import { categoryProductsTable, InsertCategoryProduct } from '@/services/db/schema/category-products'
import { InsertProduct, productsTable } from '@/services/db/schema/products'
import { baseStoreFileRelationalQuery } from '@/services/db/schema/store-files'
import { and, eq } from 'drizzle-orm'
import { difference } from 'lodash'

export const createCategory = async (newCategory: NewCategory) => {
  const categoryIndex = newCategory.index ?? (await getNextCategoryIndex(newCategory.storeId))

  return await createCategoryOnDb({ ...newCategory, index: categoryIndex })
}

export const updateCategory = async (updatedCategory: RequiredBy<InsertCategory, 'id'>) => {
  return await updateCategoryOnDb(updatedCategory.id, updatedCategory)
}

export const listCategories = async ({
  storeId,
  includeProducts = false,
}: {
  storeId: number
  includeProducts?: boolean
}) => {
  const categoriesWithProducts = await db.query.categoriesTable.findMany({
    columns: {
      imageId: false,
    },
    with: {
      image: baseStoreFileRelationalQuery,
      categoryProducts: {
        columns: {
          id: false,
          categoryId: false,
          productId: false,
          createdAt: false,
          updatedAt: false,
        },
        with: {
          product: {
            columns: { imageId: false },
            with: { image: baseStoreFileRelationalQuery },
          },
        },
      },
    },
    where: eq(categoriesTable.storeId, storeId),
    orderBy: [categoriesTable.index, categoryProductsTable.index],
  })

  const categoriesWithProductsFinal = categoriesWithProducts.map(({ categoryProducts, ...category }) => {
    if (!includeProducts) return category

    const products = categoryProducts.map(({ product, ...categoryProduct }) => ({
      ...product,
      ...categoryProduct,
    }))

    return {
      ...category,
      products,
    }
  })

  return categoriesWithProductsFinal
}

export const deleteCategory = async (categoryId: number) => {
  await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId))
}

export const createProduct = async (newProduct: NewProduct) => {
  return await db.transaction(async tx => {
    const product = await createProductOnDb({ newProduct, dbSession: tx })

    for (const categoryProduct of newProduct.categories) {
      const categoryProductIndex = await getNextCategoryProductIndex({
        categoryId: categoryProduct.categoryId,
        dbSession: tx,
      })
      await createCategoryProductOnDb({
        newCategoryProduct: { ...categoryProduct, productId: product.id, index: categoryProductIndex },
        dbSession: tx,
      })
    }
    return product
  })
}

export const updateProduct = async (
  updatedProduct: RequiredBy<InsertProduct, 'id'> & {
    categories: Array<Omit<PartialBy<InsertCategoryProduct, 'index'>, 'id' | 'productId'>>
  }
) => {
  return await db.transaction(async tx => {
    const currentCategoryProducts = await tx.query.categoryProductsTable.findMany({
      where: eq(categoryProductsTable.productId, updatedProduct.id),
    })

    const currentCategoriesIds = currentCategoryProducts.map(categoryProduct => categoryProduct.categoryId)

    const updatedProductRow = await updateProductOnDb({ updatedProduct, dbSession: tx })

    for (const categoryProduct of updatedProduct.categories) {
      const isNewCategoryProduct = !currentCategoriesIds.includes(categoryProduct.categoryId)

      if (isNewCategoryProduct) {
        const categoryProductIndex = await getNextCategoryProductIndex({
          categoryId: categoryProduct.categoryId,
          dbSession: tx,
        })
        await createCategoryProductOnDb({
          newCategoryProduct: { ...categoryProduct, productId: updatedProduct.id, index: categoryProductIndex },
          dbSession: tx,
        })

        continue
      }

      await tx
        .update(categoryProductsTable)
        .set({ ...categoryProduct, productId: updatedProduct.id })
        .where(
          and(
            eq(categoryProductsTable.categoryId, categoryProduct.categoryId),
            eq(categoryProductsTable.productId, updatedProduct.id)
          )
        )
    }

    const updatedProductCategoriesIds = updatedProduct.categories.map(categoryProduct => categoryProduct.categoryId)
    const currentCategoriesIdsToDelete = difference(currentCategoriesIds, updatedProductCategoriesIds)

    for (const categoryId of currentCategoriesIdsToDelete) {
      await tx
        .delete(categoryProductsTable)
        .where(
          and(eq(categoryProductsTable.productId, updatedProduct.id), eq(categoryProductsTable.categoryId, categoryId))
        )
    }

    return updatedProductRow
  })
}

export const deleteProduct = async (productId: number) => {
  await db.delete(productsTable).where(eq(productsTable.id, productId))
}
