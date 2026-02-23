'use server'

import { db } from '@/services/db'
import {
  InsertItemOfferingOptionGroup,
  itemOfferingOptionGroupsTable,
} from '@/services/db/schema/item-offering-option-groups'
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
  optionGroup,
  dbSession,
}: {
  id: number
  optionGroup: Partial<InsertOptionGroup>
  dbSession: DbSession
}) => {
  const [updated] = await dbSession
    .update(optionGroupsTable)
    .set(optionGroup)
    .where(eq(optionGroupsTable.id, id))
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
  option,
  dbSession,
}: {
  id: number
  option: Partial<InsertOption>
  dbSession: DbSession
}) => {
  const [updated] = await dbSession
    .update(optionsTable)
    .set(option)
    .where(eq(optionsTable.id, id))
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
  excludeIds,
  dbSession,
}: {
  optionGroupId: number
  excludeIds: number[]
  dbSession: DbSession
}) => {
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
  dbSession,
}: {
  itemOfferingId: number
  optionGroupId: number
  dbSession: DbSession
}) => {
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
  dbSession,
}: {
  itemOfferingId: number
  links: InsertItemOfferingOptionGroup[]
  dbSession: DbSession
}) => {
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
}: {
  itemOfferingId: number
}) => {
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
}: {
  itemOfferingIds: number[]
}) => {
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
