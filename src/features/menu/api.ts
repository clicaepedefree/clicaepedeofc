'use server'

import {
  createCategoryOnDb,
  createItemOfferingOnDb,
  createItemOnDb,
  getNextCategoryIndex,
  getNextItemOfferingIndex,
  updateCategoryOnDb,
  updateItemOnDb,
} from '@/features/menu/db'
import { NewCategory, NewItem } from '@/features/menu/types'
import { db } from '@/services/db'
import { categoriesTable, InsertCategory } from '@/services/db/schema/categories'
import { InsertItemOffering, itemOfferingsTable } from '@/services/db/schema/item-offerings'
import { InsertItem, itemsTable } from '@/services/db/schema/items'
import { baseStoreFileRelationalQuery, storeFilesTable } from '@/services/db/schema/store-files'
import { getTableColumnsWithExclusions } from '@/services/db/utils'
import { and, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
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
  includeItems = false,
}: {
  storeId: number
  includeItems?: boolean
}) => {
  const categoriesWithItems = await db.query.categoriesTable.findMany({
    columns: {
      imageId: false,
    },
    with: {
      image: baseStoreFileRelationalQuery,
      itemOfferings: {
        columns: {
          id: false,
          categoryId: false,
          itemId: false,
          createdAt: false,
          updatedAt: false,
        },
        with: {
          item: {
            columns: { imageId: false },
            with: { image: baseStoreFileRelationalQuery },
          },
        },
      },
    },
    where: eq(categoriesTable.storeId, storeId),
    orderBy: [categoriesTable.index, itemOfferingsTable.index],
  })

  const categoriesWithItemsFinal = categoriesWithItems.map(({ itemOfferings, ...category }) => {
    if (!includeItems) return category

    const items = itemOfferings.map(({ item, ...itemOffering }) => ({
      ...item,
      ...itemOffering,
    }))

    return {
      ...category,
      items,
    }
  })

  return categoriesWithItemsFinal
}

export const deleteCategory = async (categoryId: number) => {
  await db.delete(categoriesTable).where(eq(categoriesTable.id, categoryId))
}

export const createItem = async (newItem: NewItem) => {
  return await db.transaction(async tx => {
    const item = await createItemOnDb({ newItem, dbSession: tx })

    for (const itemOffering of newItem.offerings) {
      const itemOfferingIndex = await getNextItemOfferingIndex({
        categoryId: itemOffering.categoryId,
        dbSession: tx,
      })
      await createItemOfferingOnDb({
        newItemOffering: { ...itemOffering, itemId: item.id, index: itemOfferingIndex },
        dbSession: tx,
      })
    }
    return item
  })
}

export const updateItem = async (
  updatedItem: RequiredBy<InsertItem, 'id'> & {
    offerings: Array<Omit<PartialBy<InsertItemOffering, 'index'>, 'id' | 'itemId'>>
  }
) => {
  return await db.transaction(async tx => {
    const currentItemOfferings = await tx.query.itemOfferingsTable.findMany({
      where: eq(itemOfferingsTable.itemId, updatedItem.id),
    })

    const currentOfferingsIds = currentItemOfferings.map(itemOffering => itemOffering.categoryId)

    const updatedItemRow = await updateItemOnDb({ updatedItem: updatedItem, dbSession: tx })

    for (const itemOffering of updatedItem.offerings) {
      const isNewItemOffering = !currentOfferingsIds.includes(itemOffering.categoryId)

      if (isNewItemOffering) {
        const itemOfferingIndex = await getNextItemOfferingIndex({
          categoryId: itemOffering.categoryId,
          dbSession: tx,
        })
        await createItemOfferingOnDb({
          newItemOffering: { ...itemOffering, itemId: updatedItem.id, index: itemOfferingIndex },
          dbSession: tx,
        })

        continue
      }

      await tx
        .update(itemOfferingsTable)
        .set({ ...itemOffering, itemId: updatedItem.id })
        .where(
          and(eq(itemOfferingsTable.categoryId, itemOffering.categoryId), eq(itemOfferingsTable.itemId, updatedItem.id))
        )
    }

    const updatedItemOfferingsIds = updatedItem.offerings.map(itemOffering => itemOffering.categoryId)
    const currentOfferingsIdsToDelete = difference(currentOfferingsIds, updatedItemOfferingsIds)

    for (const categoryId of currentOfferingsIdsToDelete) {
      await tx
        .delete(itemOfferingsTable)
        .where(and(eq(itemOfferingsTable.itemId, updatedItem.id), eq(itemOfferingsTable.categoryId, categoryId)))
    }

    return updatedItemRow
  })
}

export const deleteItem = async (itemId: number) => {
  await db.delete(itemsTable).where(eq(itemsTable.id, itemId))
}

export const listMenuItems = async ({ storeId }: { storeId: number }) => {
  const categoryImagesTable = alias(storeFilesTable, 'categoryImages')
  const menuItems = await db
    .select({
      ...getTableColumnsWithExclusions(itemOfferingsTable, [
        itemOfferingsTable.createdAt,
        itemOfferingsTable.updatedAt,
        itemOfferingsTable.categoryId,
      ]),
      ...getTableColumnsWithExclusions(itemsTable, [
        itemsTable.id,
        itemsTable.createdAt,
        itemsTable.updatedAt,
        itemsTable.imageId,
      ]),
      category: {
        id: categoriesTable.id,
        name: categoriesTable.name,
        imageUrl: categoryImagesTable.url,
      },
      image: {
        id: storeFilesTable.id,
        url: storeFilesTable.url,
      },
    })
    .from(itemsTable)
    .innerJoin(itemOfferingsTable, eq(itemOfferingsTable.itemId, itemsTable.id))
    .innerJoin(categoriesTable, eq(categoriesTable.id, itemOfferingsTable.categoryId))
    .leftJoin(storeFilesTable, eq(storeFilesTable.id, itemsTable.imageId))
    .leftJoin(categoryImagesTable, eq(categoryImagesTable.id, categoriesTable.imageId))
    .where(eq(itemsTable.storeId, storeId))
    .orderBy(itemsTable.name)

  return menuItems
}
