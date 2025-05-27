'use server'

import { db } from '@/services/db'
import { countersTable, InsertCounter } from '@/services/db/schema'
import { eq } from 'drizzle-orm'

export const listCounters = async (storeId: number) => {
  return await db.query.countersTable.findMany({
    where: eq(countersTable.storeId, storeId),
  })
}

export const createCounter = async (newStore: InsertCounter) => {
  await db.insert(countersTable).values(newStore)
}
