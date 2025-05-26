'use server'

import { db } from '@/services/db'
import { cashiersTable } from '@/services/db/schema'
import { eq } from 'drizzle-orm'

export const listCashiers = async (storeId: number) => {
  return await db.query.cashiersTable.findMany({
    where: eq(cashiersTable.storeId, storeId),
  })
}
