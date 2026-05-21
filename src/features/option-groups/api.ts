'use server'

import {
  assertOptionGroupBelongsToStore,
  createOptionGroupOnDb,
  createOptionsOnDb,
  deleteOptionGroupOnDb,
  deleteOptionsByGroupIdOnDb,
  assertOptionItemsBelongToStore,
  assertOptionsBelongToOptionGroup,
  getOptionGroupsByItemOfferingId,
  getOptionGroupsByStoreId,
  replaceItemOfferingOptionGroupLinks,
  unlinkOptionGroupFromItemOffering,
  updateOptionGroupOnDb,
  updateOptionOnDb,
} from '@/features/option-groups/db'
import {
  LinkOptionGroupsToItemOffering,
  NewOptionGroup,
  UpdateOptionGroup,
} from '@/features/option-groups/types'
import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'

export const createOptionGroup = async (data: NewOptionGroup) => {
  await validateUserPermissionsForStore(data.storeId, 'admin')

  return await db.transaction(async (tx) => {
    await assertOptionItemsBelongToStore({
      itemIds: data.options.map((opt) => opt.itemId),
      storeId: data.storeId,
      dbSession: tx,
    })

    const group = await createOptionGroupOnDb({
      optionGroup: {
        storeId: data.storeId,
        name: data.name,
        minQuantity: data.minQuantity,
        maxQuantity: data.maxQuantity,
      },
      dbSession: tx,
    })

    const optionsToInsert = data.options.map((opt, idx) => ({
      optionGroupId: group.id,
      itemId: opt.itemId,
      price: opt.price,
      originalPrice: opt.originalPrice,
      minQuantity: opt.minQuantity,
      maxQuantity: opt.maxQuantity,
      index: opt.index ?? idx,
    }))

    await createOptionsOnDb({ options: optionsToInsert, dbSession: tx })

    return group
  })
}

export const updateOptionGroup = async (data: UpdateOptionGroup) => {
  await validateUserPermissionsForStore(data.storeId, 'admin')

  return await db.transaction(async (tx) => {
    await assertOptionGroupBelongsToStore({
      optionGroupId: data.id,
      storeId: data.storeId,
      dbSession: tx,
    })

    const group = await updateOptionGroupOnDb({
      id: data.id,
      storeId: data.storeId,
      optionGroup: {
        name: data.name,
        minQuantity: data.minQuantity,
        maxQuantity: data.maxQuantity,
      },
      dbSession: tx,
    })

    const existingOptionIds = data.options
      .filter((opt) => opt.id !== undefined)
      .map((opt) => opt.id as number)

    await assertOptionItemsBelongToStore({
      itemIds: data.options.map((opt) => opt.itemId),
      storeId: data.storeId,
      dbSession: tx,
    })

    await assertOptionsBelongToOptionGroup({
      optionIds: existingOptionIds,
      optionGroupId: data.id,
      dbSession: tx,
    })

    await deleteOptionsByGroupIdOnDb({
      optionGroupId: data.id,
      storeId: data.storeId,
      excludeIds: existingOptionIds,
      dbSession: tx,
    })

    for (const opt of data.options) {
      if (opt.id) {
        await updateOptionOnDb({
          id: opt.id,
          optionGroupId: data.id,
          option: {
            itemId: opt.itemId,
            price: opt.price,
            originalPrice: opt.originalPrice,
            minQuantity: opt.minQuantity,
            maxQuantity: opt.maxQuantity,
            index: opt.index,
          },
          dbSession: tx,
        })
      } else {
        await createOptionsOnDb({
          options: [
            {
              optionGroupId: data.id,
              itemId: opt.itemId,
              price: opt.price,
              originalPrice: opt.originalPrice,
              minQuantity: opt.minQuantity,
              maxQuantity: opt.maxQuantity,
              index: opt.index,
            },
          ],
          dbSession: tx,
        })
      }
    }

    return group
  })
}

export const deleteOptionGroup = async (id: number, storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  await deleteOptionGroupOnDb({ id, storeId, dbSession: db })
}

export const listOptionGroups = async (storeId: number): Promise<any[]> => {
  await validateUserPermissionsForStore(storeId, 'admin')

  return await getOptionGroupsByStoreId({ storeId })
}

export const listOptionGroupsByItemOffering = async (
  itemOfferingId: number,
  storeId: number
) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  return await getOptionGroupsByItemOfferingId({ itemOfferingId, storeId })
}

export const linkOptionGroupsToItemOffering = async (
  data: LinkOptionGroupsToItemOffering
) => {
  await validateUserPermissionsForStore(data.storeId, 'admin')

  const links = data.optionGroupIds.map((optionGroupId, index) => ({
    itemOfferingId: data.itemOfferingId,
    optionGroupId,
    index,
  }))

  return await db.transaction(async (tx) => {
    await replaceItemOfferingOptionGroupLinks({
      itemOfferingId: data.itemOfferingId,
      links,
      storeId: data.storeId,
      dbSession: tx,
    })
  })
}

export const unlinkOptionGroupFromOffering = async (
  itemOfferingId: number,
  optionGroupId: number,
  storeId: number
) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  await unlinkOptionGroupFromItemOffering({
    itemOfferingId,
    optionGroupId,
    storeId,
    dbSession: db,
  })
}
