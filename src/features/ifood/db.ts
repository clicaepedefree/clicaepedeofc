import { db } from '@/services/db'
import {
  ifoodIntegrationsTable,
  type InsertIfoodIntegration,
  type SelectIfoodIntegration,
} from '@/services/db/schema/ifood-integrations'
import { eq } from 'drizzle-orm'

export const createIFoodIntegration = async (
  data: InsertIfoodIntegration
): Promise<SelectIfoodIntegration> => {
  const [integration] = await db
    .insert(ifoodIntegrationsTable)
    .values(data)
    .returning()

  return integration
}

export const updateIFoodIntegration = async (
  storeId: number,
  data: Partial<InsertIfoodIntegration>
): Promise<SelectIfoodIntegration> => {
  const [integration] = await db
    .update(ifoodIntegrationsTable)
    .set(data)
    .where(eq(ifoodIntegrationsTable.storeId, storeId))
    .returning()

  return integration
}

export const getIFoodIntegration = async (
  storeId: number
): Promise<SelectIfoodIntegration | null> => {
  const [integration] = await db
    .select()
    .from(ifoodIntegrationsTable)
    .where(eq(ifoodIntegrationsTable.storeId, storeId))

  return integration || null
}

export const deleteIFoodIntegration = async (
  storeId: number
): Promise<void> => {
  await db
    .delete(ifoodIntegrationsTable)
    .where(eq(ifoodIntegrationsTable.storeId, storeId))
}
