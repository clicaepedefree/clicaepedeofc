'use server'
import { db } from '@/services/db'
import { categoriesTable, InsertCategory } from '@/services/db/schema/categories'
import { InsertItemOffering, itemOfferingsTable } from '@/services/db/schema/item-offerings'
import { InsertItem, itemsTable } from '@/services/db/schema/items'
import { DbSession } from '@/services/db/types'
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
  dbSession,
}: {
  updatedItem: RequiredBy<InsertItem, 'id'>
  dbSession: DbSession
}) => {
  const { id, ...updatedItemColumns } = updatedItem
  const [item] = await dbSession.update(itemsTable).set(updatedItemColumns).where(eq(itemsTable.id, id)).returning()

  return item
}
