import { db } from '@/services/db'
import {
  ifoodIntegrationsTable,
  type InsertIfoodIntegration,
  type SelectIfoodIntegration,
} from '@/services/db/schema/ifood-integrations'
import {
  ifoodOAuthSessionsTable,
  type InsertIfoodOAuthSession,
  type SelectIfoodOAuthSession,
} from '@/services/db/schema/ifood-oauth-sessions'
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

// OAuth Session functions

export const createIFoodOAuthSession = async (
  data: InsertIfoodOAuthSession
): Promise<SelectIfoodOAuthSession> => {
  // Delete any existing session for this store first
  await db
    .delete(ifoodOAuthSessionsTable)
    .where(eq(ifoodOAuthSessionsTable.storeId, data.storeId))

  const [session] = await db
    .insert(ifoodOAuthSessionsTable)
    .values(data)
    .returning()

  return session
}

export const getIFoodOAuthSession = async (
  storeId: number
): Promise<SelectIfoodOAuthSession | null> => {
  const [session] = await db
    .select()
    .from(ifoodOAuthSessionsTable)
    .where(eq(ifoodOAuthSessionsTable.storeId, storeId))

  return session || null
}

export const getIFoodOAuthSessionByUserCode = async (
  userCode: string
): Promise<SelectIfoodOAuthSession | null> => {
  const [session] = await db
    .select()
    .from(ifoodOAuthSessionsTable)
    .where(eq(ifoodOAuthSessionsTable.userCode, userCode))

  return session || null
}

export const updateIFoodOAuthSession = async (
  storeId: number,
  data: Partial<InsertIfoodOAuthSession>
): Promise<SelectIfoodOAuthSession> => {
  const [session] = await db
    .update(ifoodOAuthSessionsTable)
    .set(data)
    .where(eq(ifoodOAuthSessionsTable.storeId, storeId))
    .returning()

  return session
}

export const deleteIFoodOAuthSession = async (
  storeId: number
): Promise<void> => {
  await db
    .delete(ifoodOAuthSessionsTable)
    .where(eq(ifoodOAuthSessionsTable.storeId, storeId))
}
