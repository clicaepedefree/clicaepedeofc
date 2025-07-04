'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'
import { countersTable, InsertCounter } from '@/services/db/schema'
import { eq } from 'drizzle-orm'

export const listCounters = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  return await db.query.countersTable.findMany({
    where: eq(countersTable.storeId, storeId),
  })
}

export const createCounter = async (newStore: InsertCounter) => {
  await validateUserPermissionsForStore(newStore.storeId, 'admin')

  await db.insert(countersTable).values(newStore)
}
