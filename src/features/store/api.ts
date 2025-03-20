'use server'
import { db } from '@/services/db'
import { configurationsTable } from '@/services/db/schema/configurations'
import { storesTable } from '@/services/db/schema/store'
import { storeConfigurationsTable } from '@/services/db/schema/store-configurations'
import { coalesce } from '@/services/db/utils'
import { eq, and } from 'drizzle-orm'

export const getAvailableStores = async () => await db.select().from(storesTable)

export const getStoreConfigurations = async (storeId: number) => {
  const result = await db
    .select({
      id: configurationsTable.id,
      category: configurationsTable.category,
      name: configurationsTable.name,
      type: configurationsTable.type,
      value: coalesce<string | null>(storeConfigurationsTable.value, configurationsTable.default),
      createdAt: storeConfigurationsTable.createdAt,
      updatedAt: storeConfigurationsTable.updatedAt,
    })
    .from(configurationsTable)
    .leftJoin(
      storeConfigurationsTable,
      and(
        eq(configurationsTable.id, storeConfigurationsTable.configurationId),
        eq(storeConfigurationsTable.storeId, storeId)
      )
    )
  return result
}
