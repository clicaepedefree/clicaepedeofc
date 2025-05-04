'use server'

import { createCategoryOnDb, getNextCategoryIndex } from '@/features/catalog/db'
import { db } from '@/services/db'
import { categoriesTable, InsertCategory } from '@/services/db/schema/categories'
import { storeFilesTable } from '@/services/db/schema/store-files'
import { eq, getTableColumns } from 'drizzle-orm'

export const createCategory = async (newCategory: PartialBy<InsertCategory, 'index'>) => {
  const categoryIndex = newCategory.index ?? (await getNextCategoryIndex(newCategory.storeId))

  return await createCategoryOnDb({ ...newCategory, index: categoryIndex })
}

export const listCategories = async (storeId: number) => {
  const categories = await db
    .select({
      ...getTableColumns(categoriesTable),
      image: {
        id: storeFilesTable.id,
        url: storeFilesTable.url,
      },
    })
    .from(categoriesTable)
    .leftJoin(storeFilesTable, eq(categoriesTable.imageId, storeFilesTable.id))
    .where(eq(categoriesTable.storeId, storeId))
    .orderBy(categoriesTable.index)
  return categories
}

export const deleteCategory = async (categoryId: number) => {
  await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId))
}
