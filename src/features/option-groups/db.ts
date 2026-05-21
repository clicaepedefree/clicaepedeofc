'use server'

import { db } from '@/services/db'
import {
  InsertItemOfferingOptionGroup,
  itemOfferingOptionGroupsTable,
} from '@/services/db/schema/item-offering-option-groups'
import { itemOfferingsTable } from '@/services/db/schema/item-offerings'
import { itemsTable } from '@/services/db/schema/items'
import {
  InsertOptionGroup,
  optionGroupsTable,
} from '@/services/db/schema/option-groups'
import { InsertOption, optionsTable } from '@/services/db/schema/options'
import { DbSession } from '@/services/db/types'
import { and, desc, eq, inArray, notInArray } from 'drizzle-orm'

// ── Option Groups ──

export const createOptionGroupOnDb = async ({
  optionGroup,
  dbSession,
}: {
  optionGroup: InsertOptionGroup
  dbSession: DbSession
}) => {
  const [created] = await dbSession
    .insert(optionGroupsTable)
    .values(optionGroup)
    .returning()

  return created
}

export const updateOptionGroupOnDb = async ({
  id,
  storeId,
  optionGroup,
  dbSession,
}: {
  id: number
  storeId: number
  optionGroup: Partial<InsertOptionGroup>
  dbSession: DbSession
}) => {
  const { storeId: _storeId, ...optionGroupColumns } = optionGroup
  const [updated] = await dbSession
    .update(optionGroupsTable)
    .set(optionGroupColumns)
    .where(and(eq(optionGroupsTable.id, id), eq(optionGroupsTable.storeId, storeId)))
    .returning()

  return updated
}

export const deleteOptionGroupOnDb = async ({
  id,
  storeId,
  dbSession,
}: {
  id: number
  storeId: number
  dbSession: DbSession
}) => {
  await dbSession
    .delete(optionGroupsTable)
    .where(
      and(
        eq(optionGroupsTable.id, id),
        eq(optionGroupsTable.storeId, storeId)
      )
    )
}

// ── Options ──

export const createOptionOnDb = async ({
  option,
  dbSession,
}: {
  option: InsertOption
  dbSession: DbSession
}) => {
  const [created] = await dbSession
    .insert(optionsTable)
    .values(option)
    .returning()

  return created
}

export const createOptionsOnDb = async ({
  options,
  dbSession,
}: {
  options: InsertOption[]
  dbSession: DbSession
}) => {
  if (options.length === 0) return []

  return await dbSession.insert(optionsTable).values(options).returning()
}

export const updateOptionOnDb = async ({
  id,
  optionGroupId,
  option,
  dbSession,
}: {
  id: number
  optionGroupId: number
  option: Partial<InsertOption>
  dbSession: DbSession
}) => {
  const { optionGroupId: _optionGroupId, ...optionColumns } = option
  const [updated] = await dbSession
    .update(optionsTable)
    .set(optionColumns)
    .where(
      and(eq(optionsTable.id, id), eq(optionsTable.optionGroupId, optionGroupId))
    )
    .returning()

  return updated
}

export const deleteOptionOnDb = async ({
  id,
  dbSession,
}: {
  id: number
  dbSession: DbSession
}) => {
  await dbSession.delete(optionsTable).where(eq(optionsTable.id, id))
}

export const deleteOptionsByGroupIdOnDb = async ({
  optionGroupId,
  storeId,
  excludeIds,
  dbSession,
}: {
  optionGroupId: number
  storeId: number
  excludeIds: number[]
  dbSession: DbSession
}) => {
  await assertOptionGroupBelongsToStore({ optionGroupId, storeId, dbSession })

  if (excludeIds.length > 0) {
    await dbSession
      .delete(optionsTable)
      .where(
        and(
          eq(optionsTable.optionGroupId, optionGroupId),
          notInArray(optionsTable.id, excludeIds)
        )
      )
  } else {
    await dbSession
      .delete(optionsTable)
      .where(eq(optionsTable.optionGroupId, optionGroupId))
  }
}

export const getNextOptionIndex = async ({
  optionGroupId,
  dbSession,
}: {
  optionGroupId: number
  dbSession: DbSession
}) => {
  const result = await dbSession
    .select({ index: optionsTable.index })
    .from(optionsTable)
    .where(eq(optionsTable.optionGroupId, optionGroupId))
    .orderBy(desc(optionsTable.index))
    .limit(1)

  const currentMaximumIndex = result[0]?.index ?? 0
  return currentMaximumIndex + 1
}

// ── Junction: Item Offering <-> Option Groups ──

export const linkOptionGroupToItemOffering = async ({
  link,
  dbSession,
}: {
  link: InsertItemOfferingOptionGroup
  dbSession: DbSession
}) => {
  const [created] = await dbSession
    .insert(itemOfferingOptionGroupsTable)
    .values(link)
    .returning()

  return created
}

export const unlinkOptionGroupFromItemOffering = async ({
  itemOfferingId,
  optionGroupId,
  storeId,
  dbSession,
}: {
  itemOfferingId: number
  optionGroupId: number
  storeId: number
  dbSession: DbSession
}) => {
  await assertItemOfferingBelongsToStore({ itemOfferingId, storeId, dbSession })
  await assertOptionGroupBelongsToStore({ optionGroupId, storeId, dbSession })

  await dbSession
    .delete(itemOfferingOptionGroupsTable)
    .where(
      and(
        eq(itemOfferingOptionGroupsTable.itemOfferingId, itemOfferingId),
        eq(itemOfferingOptionGroupsTable.optionGroupId, optionGroupId)
      )
    )
}

export const replaceItemOfferingOptionGroupLinks = async ({
  itemOfferingId,
  links,
  storeId,
  dbSession,
}: {
  itemOfferingId: number
  links: InsertItemOfferingOptionGroup[]
  storeId: number
  dbSession: DbSession
}) => {
  await assertItemOfferingBelongsToStore({ itemOfferingId, storeId, dbSession })
  await assertOptionGroupsBelongToStore({
    optionGroupIds: links.map((link) => link.optionGroupId),
    storeId,
    dbSession,
  })

  await dbSession
    .delete(itemOfferingOptionGroupsTable)
    .where(eq(itemOfferingOptionGroupsTable.itemOfferingId, itemOfferingId))

  if (links.length > 0) {
    await dbSession.insert(itemOfferingOptionGroupsTable).values(links)
  }
}

// ── Queries ──

export const getOptionGroupsByStoreId = async ({
  storeId,
}: {
  storeId: number
}) => {
  return await db.query.optionGroupsTable.findMany({
    where: eq(optionGroupsTable.storeId, storeId),
    with: {
      options: {
        with: {
          item: {
            columns: { id: true, name: true },
          },
        },
        orderBy: [optionsTable.index],
      },
    },
    orderBy: [optionGroupsTable.name],
  })
}

export const getOptionGroupsByItemOfferingId = async ({
  itemOfferingId,
  storeId,
}: {
  itemOfferingId: number
  storeId: number
}) => {
  await assertItemOfferingBelongsToStore({
    itemOfferingId,
    storeId,
    dbSession: db,
  })

  const junctionRows =
    await db.query.itemOfferingOptionGroupsTable.findMany({
      where: eq(
        itemOfferingOptionGroupsTable.itemOfferingId,
        itemOfferingId
      ),
      with: {
        optionGroup: {
          with: {
            options: {
              with: {
                item: {
                  columns: { id: true, name: true },
                },
              },
              orderBy: [optionsTable.index],
            },
          },
        },
      },
      orderBy: [itemOfferingOptionGroupsTable.index],
    })

  return junctionRows.map((row) => ({
    ...row.optionGroup,
    junctionIndex: row.index,
  }))
}

export const getOptionGroupsByItemOfferingIds = async ({
  itemOfferingIds,
  storeId,
}: {
  itemOfferingIds: number[]
  storeId?: number
}) => {
  if (storeId !== undefined) {
    await assertItemOfferingsBelongToStore({
      itemOfferingIds,
      storeId,
      dbSession: db,
    })
  }

  const junctionRows =
    await db.query.itemOfferingOptionGroupsTable.findMany({
      where: inArray(
        itemOfferingOptionGroupsTable.itemOfferingId,
        itemOfferingIds
      ),
      with: {
        optionGroup: {
          with: {
            options: {
              with: {
                item: {
                  columns: { id: true, name: true },
                },
              },
              orderBy: [optionsTable.index],
            },
          },
        },
      },
      orderBy: [itemOfferingOptionGroupsTable.index],
    })

  const grouped: Record<number, typeof junctionRows[number]['optionGroup'][]> = {}
  for (const row of junctionRows) {
    const id = row.itemOfferingId
    if (!grouped[id]) grouped[id] = []
    grouped[id].push(row.optionGroup)
  }

  return grouped
}

export const assertOptionGroupBelongsToStore = async ({
  optionGroupId,
  storeId,
  dbSession,
}: {
  optionGroupId: number
  storeId: number
  dbSession: DbSession
}) => {
  const rows = await dbSession
    .select({ id: optionGroupsTable.id })
    .from(optionGroupsTable)
    .where(
      and(
        eq(optionGroupsTable.id, optionGroupId),
        eq(optionGroupsTable.storeId, storeId)
      )
    )
    .limit(1)

  if (!rows[0]) {
    throw new Error('Option group does not belong to the validated store')
  }
}

export const assertOptionGroupsBelongToStore = async ({
  optionGroupIds,
  storeId,
  dbSession,
}: {
  optionGroupIds: number[]
  storeId: number
  dbSession: DbSession
}) => {
  const uniqueIds = [...new Set(optionGroupIds)]
  if (uniqueIds.length === 0) return

  const rows = await dbSession
    .select({ id: optionGroupsTable.id })
    .from(optionGroupsTable)
    .where(
      and(
        inArray(optionGroupsTable.id, uniqueIds),
        eq(optionGroupsTable.storeId, storeId)
      )
    )

  if (rows.length !== uniqueIds.length) {
    throw new Error('All option groups must belong to the validated store')
  }
}

export const assertOptionItemsBelongToStore = async ({
  itemIds,
  storeId,
  dbSession,
}: {
  itemIds: number[]
  storeId: number
  dbSession: DbSession
}) => {
  const uniqueIds = [...new Set(itemIds)]
  if (uniqueIds.length === 0) return

  const rows = await dbSession
    .select({ id: itemsTable.id })
    .from(itemsTable)
    .where(and(inArray(itemsTable.id, uniqueIds), eq(itemsTable.storeId, storeId)))

  if (rows.length !== uniqueIds.length) {
    throw new Error('All option items must belong to the validated store')
  }
}

export const assertOptionsBelongToOptionGroup = async ({
  optionIds,
  optionGroupId,
  dbSession,
}: {
  optionIds: number[]
  optionGroupId: number
  dbSession: DbSession
}) => {
  const uniqueIds = [...new Set(optionIds)]
  if (uniqueIds.length === 0) return

  const rows = await dbSession
    .select({ id: optionsTable.id })
    .from(optionsTable)
    .where(
      and(
        inArray(optionsTable.id, uniqueIds),
        eq(optionsTable.optionGroupId, optionGroupId)
      )
    )

  if (rows.length !== uniqueIds.length) {
    throw new Error('All options must belong to the option group being updated')
  }
}

export const assertItemOfferingBelongsToStore = async ({
  itemOfferingId,
  storeId,
  dbSession,
}: {
  itemOfferingId: number
  storeId: number
  dbSession: DbSession
}) => {
  await assertItemOfferingsBelongToStore({
    itemOfferingIds: [itemOfferingId],
    storeId,
    dbSession,
  })
}

export const assertItemOfferingsBelongToStore = async ({
  itemOfferingIds,
  storeId,
  dbSession,
}: {
  itemOfferingIds: number[]
  storeId: number
  dbSession: DbSession
}) => {
  const uniqueIds = [...new Set(itemOfferingIds)]
  if (uniqueIds.length === 0) return

  const rows = await dbSession
    .select({ id: itemOfferingsTable.id })
    .from(itemOfferingsTable)
    .innerJoin(itemsTable, eq(itemsTable.id, itemOfferingsTable.itemId))
    .where(
      and(
        inArray(itemOfferingsTable.id, uniqueIds),
        eq(itemsTable.storeId, storeId)
      )
    )

  if (rows.length !== uniqueIds.length) {
    throw new Error('All item offerings must belong to the validated store')
  }
}
