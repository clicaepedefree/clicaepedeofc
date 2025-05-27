'use server'

import { db } from '@/services/db'
import { countersTable } from '@/services/db/schema'
import { eq } from 'drizzle-orm'

export const listCounters = async (storeId: number) => {
  return await db.query.countersTable.findMany({
    where: eq(countersTable.storeId, storeId),
  })
}
