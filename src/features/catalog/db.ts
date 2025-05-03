'use server'
import { eq, desc, getTableColumns } from 'drizzle-orm'
import { db } from '@/services/db'
import { categoriesTable } from '@/services/db/schema/categories'
import { InsertCategory } from '@/services/db/schema/categories'
import { storeFilesTable } from '@/services/db/schema/store-files'

export const createCategoryOnDb = async (newCategory: InsertCategory) => {
  const [createdCategory] = await db.insert(categoriesTable).values(newCategory).returning()

  return createdCategory
}

export const getNextCategoryIndex = async (storeId: number) => {
  const result = await db
    .select({ index: categoriesTable.index })
    .from(categoriesTable)
    .where(eq(categoriesTable.storeId, storeId))
    .orderBy(desc(categoriesTable.index))
    .limit(1)

  const currentMaximumIndex = result[0]?.index ?? 0
  const nextIndex = currentMaximumIndex + 1
  return nextIndex
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
  return categories
}
