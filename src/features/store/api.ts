'use server'
import { db } from '@/services/db'
import { storesTable } from '@/services/db/schema/store'

export const getAvailableStores = async () => await db.select().from(storesTable)
