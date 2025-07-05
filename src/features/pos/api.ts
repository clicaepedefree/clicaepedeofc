'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'
import {
  counterSessionsTable,
  countersTable,
  InsertCounter,
} from '@/services/db/schema'
import { and, eq, getTableColumns, sql } from 'drizzle-orm'

export const listCounters = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  return await db
    .select({
      ...getTableColumns(countersTable),
      isAvailable: sql<boolean>`count(${counterSessionsTable.id}) = 0`,
    })
    .from(countersTable)
    .leftJoin(
      counterSessionsTable,
      and(
        eq(countersTable.id, counterSessionsTable.counterId),
        eq(counterSessionsTable.status, 'OPEN')
      )
    )
    .where(eq(countersTable.storeId, storeId))
    .groupBy(countersTable.id)
}

export const createCounter = async (newStore: InsertCounter) => {
  await validateUserPermissionsForStore(newStore.storeId, 'admin')

  await db.insert(countersTable).values(newStore)
}
