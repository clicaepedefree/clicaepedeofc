'use server'
import { db } from '@/services/db'
import { categoriesTable, InsertCategory } from '@/services/db/schema/categories'
import { desc, eq } from 'drizzle-orm'

export const createCategoryOnDb = async (newCategory: InsertCategory) => {
  const [createdCategory] = await db.insert(categoriesTable).values(newCategory).returning()

  return createdCategory
}

export const updateCategoryOnDb = async (id: number, updatedCategoryData: InsertCategory) => {
  const [updatedCategory] = await db
    .update(categoriesTable)
    .set(updatedCategoryData)
    .where(eq(categoriesTable.id, id))
    .returning()

  return updatedCategory
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
