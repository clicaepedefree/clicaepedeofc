'use server'
import { db } from '@/services/db'
import { categoriesTable, InsertCategory } from '@/services/db/schema/categories'
import { InsertItemOffering, itemOfferingsTable } from '@/services/db/schema/item-offerings'
import { InsertItem, itemsTable } from '@/services/db/schema/items'
import { DbSession } from '@/services/db/types'
import { and, desc, eq, inArray } from 'drizzle-orm'

export const createCategoryOnDb = async (newCategory: InsertCategory) => {
  const [createdCategory] = await db.insert(categoriesTable).values(newCategory).returning()

  return createdCategory
}

export const updateCategoryOnDb = async (
  id: number,
  storeId: number,
  updatedCategoryData: InsertCategory
) => {
  const { storeId: _storeId, ...updatedCategoryColumns } = updatedCategoryData
  const [updatedCategory] = await db
    .update(categoriesTable)
    .set(updatedCategoryColumns)
    .where(and(eq(categoriesTable.id, id), eq(categoriesTable.storeId, storeId)))
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

export const getNextItemOfferingIndex = async ({
  categoryId,
  dbSession,
}: {
  categoryId: number
  dbSession: DbSession
}) => {
  const result = await dbSession
    .select({ index: itemOfferingsTable.index })
    .from(itemOfferingsTable)
    .where(eq(itemOfferingsTable.categoryId, categoryId))
    .orderBy(desc(itemOfferingsTable.index))
    .limit(1)

  const currentMaximumIndex = result[0]?.index ?? 0
  const nextIndex = currentMaximumIndex + 1
  return nextIndex
}

export const getCategoryIdsForStore = async ({
  categoryIds,
  storeId,
  dbSession,
}: {
  categoryIds: number[]
  storeId: number
  dbSession: DbSession
}) => {
  if (categoryIds.length === 0) return []

  return await dbSession
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(
      and(
        inArray(categoriesTable.id, categoryIds),
        eq(categoriesTable.storeId, storeId)
      )
    )
}

export const createItemOnDb = async ({ newItem, dbSession }: { newItem: InsertItem; dbSession: DbSession }) => {
  const [createdItem] = await dbSession.insert(itemsTable).values(newItem).returning()

  return createdItem
}

export const createItemOfferingOnDb = async ({
  newItemOffering,
  dbSession,
}: {
  newItemOffering: InsertItemOffering
  dbSession: DbSession
}) => {
  const [createdItemOffering] = await dbSession.insert(itemOfferingsTable).values(newItemOffering).returning()

  return createdItemOffering
}

export const updateItemOnDb = async ({
  updatedItem,
  storeId,
  dbSession,
}: {
  updatedItem: RequiredBy<InsertItem, 'id'>
  storeId: number
  dbSession: DbSession
}) => {
  const { id, ...updatedItemColumns } = updatedItem
  const { storeId: _storeId, ...safeUpdatedItemColumns } = updatedItemColumns
  const [item] = await dbSession
    .update(itemsTable)
    .set(safeUpdatedItemColumns)
    .where(and(eq(itemsTable.id, id), eq(itemsTable.storeId, storeId)))
    .returning()

  return item
}
