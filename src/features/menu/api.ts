'use server'

import {
  createCategoryOnDb,
  createItemOfferingOnDb,
  createItemOnDb,
  getCategoryIdsForStore,
  getNextCategoryIndex,
  getNextItemOfferingIndex,
  updateCategoryOnDb,
  updateItemOfferingAvailabilityOnDb,
  updateItemOnDb,
} from '@/features/menu/db'
import { NewCategory, NewItem } from '@/features/menu/types'
import {
  assertOptionGroupsBelongToStore,
  getOptionGroupsByItemOfferingIds,
  replaceItemOfferingOptionGroupLinks,
} from '@/features/option-groups/db'
import { db } from '@/services/db'
import {
  categoriesTable,
  InsertCategory,
} from '@/services/db/schema/categories'
import {
  InsertItemOffering,
  itemOfferingsTable,
} from '@/services/db/schema/item-offerings'
import { itemOfferingOptionGroupsTable } from '@/services/db/schema/item-offering-option-groups'
import { InsertItem, itemsTable } from '@/services/db/schema/items'
import {
  baseStoreFileRelationalQuery,
  storeFilesTable,
} from '@/services/db/schema/store-files'
import { DbSession } from '@/services/db/types'
import { getTableColumnsWithExclusions } from '@/services/db/utils'
import { and, asc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { difference } from 'lodash'
import { validateUserPermissionsForStore } from '../store/api'

export const createCategory = async (newCategory: NewCategory) => {
  const storeId = newCategory.storeId
  await validateUserPermissionsForStore(storeId, 'menu.manage')

  const categoryIndex =
    newCategory.index ?? (await getNextCategoryIndex(storeId))

  return await createCategoryOnDb({ ...newCategory, index: categoryIndex })
}

export const updateCategory = async (
  updatedCategory: RequiredBy<InsertCategory, 'id'>
) => {
  const storeId = updatedCategory.storeId
  await validateUserPermissionsForStore(storeId, 'menu.manage')

  return await updateCategoryOnDb(updatedCategory.id, storeId, updatedCategory)
}

export const listCategories = async ({
  storeId,
  includeItems = false,
}: {
  storeId: number
  includeItems?: boolean
}): Promise<any[]> => {
  await validateUserPermissionsForStore(storeId, 'menu.manage')

  const categoriesWithItems = await db.query.categoriesTable.findMany({
    columns: {
      imageId: false,
    },
    with: {
      image: baseStoreFileRelationalQuery,
      itemOfferings: {
        columns: {
          categoryId: false,
          itemId: false,
          createdAt: false,
          updatedAt: false,
        },
        orderBy: [itemOfferingsTable.index],
        with: {
          item: {
            columns: { imageId: false },
            with: { image: baseStoreFileRelationalQuery },
          },
        },
      },
    },
    where: eq(categoriesTable.storeId, storeId),
    orderBy: [categoriesTable.index],
  })

  if (!includeItems) {
    return categoriesWithItems.map(
      ({ itemOfferings, ...category }) => category
    )
  }

  const allItemOfferingIds = categoriesWithItems.flatMap((cat) =>
    cat.itemOfferings.map((io) => io.id)
  )

  const optionGroupsByOffering =
    allItemOfferingIds.length > 0
      ? await getOptionGroupsByItemOfferingIds({
          itemOfferingIds: allItemOfferingIds,
          storeId,
        })
      : {}

  const categoriesWithItemsFinal = categoriesWithItems.map(
    ({ itemOfferings, ...category }) => {
      const items = itemOfferings.map(
        ({ item, id: itemOfferingId, ...itemOffering }) => ({
          ...item,
          ...itemOffering,
          itemOfferingId,
          optionGroups: optionGroupsByOffering[itemOfferingId] ?? [],
        })
      )

      return {
        ...category,
        items,
      }
    }
  )

  return categoriesWithItemsFinal
}

export const deleteCategory = async (categoryId: number, storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'menu.manage')

  await db
    .delete(categoriesTable)
    .where(
      and(
        eq(categoriesTable.id, categoryId),
        eq(categoriesTable.storeId, storeId)
      )
    )
}

export const moveCategory = async ({
  categoryId,
  storeId,
  direction,
}: {
  categoryId: number
  storeId: number
  direction: 'up' | 'down'
}) => {
  await validateUserPermissionsForStore(storeId, 'menu.manage')

  await db.transaction(async tx => {
    const categories = await tx
      .select({ id: categoriesTable.id, index: categoriesTable.index })
      .from(categoriesTable)
      .where(eq(categoriesTable.storeId, storeId))
      .orderBy(asc(categoriesTable.index), asc(categoriesTable.name))

    const currentIndex = categories.findIndex(category => category.id === categoryId)
    if (currentIndex < 0) throw new Error('Category does not belong to the validated store')

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    const targetCategory = categories[targetIndex]
    const currentCategory = categories[currentIndex]

    if (!targetCategory || !currentCategory) return

    await tx
      .update(categoriesTable)
      .set({ index: targetCategory.index })
      .where(and(eq(categoriesTable.id, currentCategory.id), eq(categoriesTable.storeId, storeId)))

    await tx
      .update(categoriesTable)
      .set({ index: currentCategory.index })
      .where(and(eq(categoriesTable.id, targetCategory.id), eq(categoriesTable.storeId, storeId)))
  })
}

export const createItem = async (
  newItem: NewItem & { optionGroupIds?: number[] }
) => {
  const storeId = newItem.storeId
  await validateUserPermissionsForStore(storeId, 'menu.manage')

  return await db.transaction(async tx => {
    await assertCategoriesBelongToStore({
      categoryIds: newItem.offerings.map((offering) => offering.categoryId),
      storeId,
      dbSession: tx,
    })
    await assertOptionGroupsBelongToStore({
      optionGroupIds: newItem.optionGroupIds ?? [],
      storeId,
      dbSession: tx,
    })

    const item = await createItemOnDb({ newItem, dbSession: tx })

    let firstOfferingId: number | null = null
    for (const itemOffering of newItem.offerings) {
      const itemOfferingIndex = await getNextItemOfferingIndex({
        categoryId: itemOffering.categoryId,
        dbSession: tx,
      })
      const offering = await createItemOfferingOnDb({
        newItemOffering: {
          ...itemOffering,
          itemId: item.id,
          index: itemOfferingIndex,
        },
        dbSession: tx,
      })
      if (!firstOfferingId) firstOfferingId = offering.id
    }

    if (newItem.optionGroupIds?.length && firstOfferingId) {
      const links = newItem.optionGroupIds.map((optionGroupId, index) => ({
        itemOfferingId: firstOfferingId!,
        optionGroupId,
        index,
      }))
      await replaceItemOfferingOptionGroupLinks({
        itemOfferingId: firstOfferingId,
        links,
        storeId,
        dbSession: tx,
      })
    }

    return item
  })
}

export const duplicateItem = async ({
  itemId,
  itemOfferingId,
  storeId,
}: {
  itemId: number
  itemOfferingId: number
  storeId: number
}) => {
  await validateUserPermissionsForStore(storeId, 'menu.manage')

  return await db.transaction(async tx => {
    const [source] = await tx
      .select({
        itemId: itemsTable.id,
        name: itemsTable.name,
        description: itemsTable.description,
        imageId: itemsTable.imageId,
        inventory: itemsTable.inventory,
        isAvailable: itemOfferingsTable.isAvailable,
        categoryId: itemOfferingsTable.categoryId,
        price: itemOfferingsTable.price,
        originalPrice: itemOfferingsTable.originalPrice,
        externalCode: itemOfferingsTable.externalCode,
        ean: itemsTable.ean,
      })
      .from(itemsTable)
      .innerJoin(itemOfferingsTable, eq(itemOfferingsTable.itemId, itemsTable.id))
      .innerJoin(categoriesTable, eq(categoriesTable.id, itemOfferingsTable.categoryId))
      .where(
        and(
          eq(itemsTable.id, itemId),
          eq(itemOfferingsTable.id, itemOfferingId),
          eq(itemsTable.storeId, storeId),
          eq(categoriesTable.storeId, storeId)
        )
      )
      .limit(1)

    if (!source) throw new Error('Item does not belong to the validated store')

    const createdItem = await createItemOnDb({
      newItem: {
        storeId,
        name: `${source.name} (copia)`,
        description: source.description,
        imageId: source.imageId,
        inventory: source.inventory,
        ean: source.ean,
      },
      dbSession: tx,
    })

    const itemOfferingIndex = await getNextItemOfferingIndex({
      categoryId: source.categoryId,
      dbSession: tx,
    })

    const createdOffering = await createItemOfferingOnDb({
      newItemOffering: {
        itemId: createdItem.id,
        categoryId: source.categoryId,
        price: source.price,
        originalPrice: source.originalPrice,
        isAvailable: source.isAvailable,
        externalCode: source.externalCode,
        index: itemOfferingIndex,
      },
      dbSession: tx,
    })

    const optionGroupLinks = await tx
      .select({
        optionGroupId: itemOfferingOptionGroupsTable.optionGroupId,
        index: itemOfferingOptionGroupsTable.index,
      })
      .from(itemOfferingOptionGroupsTable)
      .where(eq(itemOfferingOptionGroupsTable.itemOfferingId, itemOfferingId))
      .orderBy(asc(itemOfferingOptionGroupsTable.index))

    if (optionGroupLinks.length > 0) {
      await replaceItemOfferingOptionGroupLinks({
        itemOfferingId: createdOffering.id,
        storeId,
        links: optionGroupLinks.map(link => ({
          itemOfferingId: createdOffering.id,
          optionGroupId: link.optionGroupId,
          index: link.index,
        })),
        dbSession: tx,
      })
    }

    return createdItem
  })
}

export const updateItem = async (
  updatedItem: RequiredBy<InsertItem, 'id'> & {
    offerings: Array<
      Omit<PartialBy<InsertItemOffering, 'index'>, 'id' | 'itemId'>
    >
  }
) => {
  const storeId = updatedItem.storeId
  await validateUserPermissionsForStore(storeId, 'menu.manage')

  return await db.transaction(async tx => {
    await assertCategoriesBelongToStore({
      categoryIds: updatedItem.offerings.map((offering) => offering.categoryId),
      storeId,
      dbSession: tx,
    })

    const currentItemOfferings = await tx
      .select({ categoryId: itemOfferingsTable.categoryId })
      .from(itemOfferingsTable)
      .innerJoin(itemsTable, eq(itemsTable.id, itemOfferingsTable.itemId))
      .where(
        and(
          eq(itemOfferingsTable.itemId, updatedItem.id),
          eq(itemsTable.storeId, storeId)
        )
      )

    const currentOfferingsIds = currentItemOfferings.map(
      itemOffering => itemOffering.categoryId
    )

    const updatedItemRow = await updateItemOnDb({
      updatedItem: updatedItem,
      storeId,
      dbSession: tx,
    })

    if (!updatedItemRow) {
      throw new Error('Item does not belong to the validated store')
    }

    for (const itemOffering of updatedItem.offerings) {
      const isNewItemOffering = !currentOfferingsIds.includes(
        itemOffering.categoryId
      )

      if (isNewItemOffering) {
        const itemOfferingIndex = await getNextItemOfferingIndex({
          categoryId: itemOffering.categoryId,
          dbSession: tx,
        })
        await createItemOfferingOnDb({
          newItemOffering: {
            ...itemOffering,
            itemId: updatedItem.id,
            index: itemOfferingIndex,
          },
          dbSession: tx,
        })

        continue
      }

      await tx
        .update(itemOfferingsTable)
        .set({ ...itemOffering, itemId: updatedItem.id })
        .where(
          and(
            eq(itemOfferingsTable.categoryId, itemOffering.categoryId),
            eq(itemOfferingsTable.itemId, updatedItem.id)
          )
        )
    }

    const updatedItemOfferingsIds = updatedItem.offerings.map(
      itemOffering => itemOffering.categoryId
    )
    const currentOfferingsIdsToDelete = difference(
      currentOfferingsIds,
      updatedItemOfferingsIds
    )

    for (const categoryId of currentOfferingsIdsToDelete) {
      await tx
        .delete(itemOfferingsTable)
        .where(
          and(
            eq(itemOfferingsTable.itemId, updatedItem.id),
            eq(itemOfferingsTable.categoryId, categoryId)
          )
        )
    }

    return updatedItemRow
  })
}

export const updateItemOfferingAvailability = async ({
  itemOfferingId,
  storeId,
  isAvailable,
}: {
  itemOfferingId: number
  storeId: number
  isAvailable: boolean
}) => {
  await validateUserPermissionsForStore(storeId, 'menu.manage')

  const updatedItemOffering = await updateItemOfferingAvailabilityOnDb({
    itemOfferingId,
    storeId,
    isAvailable,
  })

  if (!updatedItemOffering) {
    throw new Error('Item offering does not belong to the validated store')
  }

  return updatedItemOffering
}

export const deleteItem = async (itemId: number, storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'menu.manage')

  await db
    .delete(itemsTable)
    .where(and(eq(itemsTable.id, itemId), eq(itemsTable.storeId, storeId)))
}

export const listMenuItems = async ({ storeId }: { storeId: number }): Promise<any[]> => {
  await validateUserPermissionsForStore(storeId, 'menu.manage')
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
    .innerJoin(
      categoriesTable,
      eq(categoriesTable.id, itemOfferingsTable.categoryId)
    )
    .leftJoin(storeFilesTable, eq(storeFilesTable.id, itemsTable.imageId))
    .leftJoin(
      categoryImagesTable,
      eq(categoryImagesTable.id, categoriesTable.imageId)
    )
    .where(eq(itemsTable.storeId, storeId))
    .orderBy(itemsTable.name)

  const itemOfferingIds = menuItems.map(item => item.id)

  const optionGroupsByOffering =
    itemOfferingIds.length > 0
      ? await getOptionGroupsByItemOfferingIds({ itemOfferingIds, storeId })
      : {}

  const menuItemsWithOptionGroups = menuItems.map(item => ({
    ...item,
    optionGroups: optionGroupsByOffering[item.id] ?? [],
  }))

  return menuItemsWithOptionGroups
}

const assertCategoriesBelongToStore = async ({
  categoryIds,
  storeId,
  dbSession,
}: {
  categoryIds: number[]
  storeId: number
  dbSession: DbSession
}) => {
  const uniqueCategoryIds = [...new Set(categoryIds)]
  const rows = await getCategoryIdsForStore({
    categoryIds: uniqueCategoryIds,
    storeId,
    dbSession,
  })

  if (rows.length !== uniqueCategoryIds.length) {
    throw new Error('All item offering categories must belong to the validated store')
  }
}
