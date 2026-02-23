'use server'

import {
  createOptionGroupOnDb,
  createOptionsOnDb,
  deleteOptionGroupOnDb,
  deleteOptionsByGroupIdOnDb,
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
    const group = await updateOptionGroupOnDb({
      id: data.id,
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

    await deleteOptionsByGroupIdOnDb({
      optionGroupId: data.id,
      excludeIds: existingOptionIds,
      dbSession: tx,
    })

    for (const opt of data.options) {
      if (opt.id) {
        await updateOptionOnDb({
          id: opt.id,
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

export const listOptionGroups = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  return await getOptionGroupsByStoreId({ storeId })
}

export const listOptionGroupsByItemOffering = async (
  itemOfferingId: number,
  storeId: number
) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  return await getOptionGroupsByItemOfferingId({ itemOfferingId })
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
    dbSession: db,
  })
}
