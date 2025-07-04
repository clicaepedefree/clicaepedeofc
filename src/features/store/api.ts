'use server'
import { getAuthenticatedUser } from '@/services/auth'
import { db } from '@/services/db'
import { configurationsTable } from '@/services/db/schema/configurations'
import { storeConfigurationsTable } from '@/services/db/schema/store-configurations'
import {
  InsertStoreFile,
  storeFilesTable,
} from '@/services/db/schema/store-files'
import { storesTable } from '@/services/db/schema/stores'
import { coalesce, getTableColumnsWithExclusions } from '@/services/db/utils'
import { and, eq } from 'drizzle-orm'
import { redirect, RedirectType } from 'next/navigation'
import { isUserAdminOfAnyStore } from './db'

export const getAvailableStores = async () =>
  await db.select().from(storesTable)

export const getStoreConfigurations = async (storeId: number) =>
  await db
    .select({
      id: configurationsTable.id,
      category: configurationsTable.category,
      name: configurationsTable.name,
      type: configurationsTable.type,
      value: coalesce<string | null>(
        storeConfigurationsTable.value,
        configurationsTable.default
      ),
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

export const updateStoreConfiguration = async (
  storeId: number,
  configurationId: number,
  value: string
) => {
  await db
    .insert(storeConfigurationsTable)
    .values({ storeId, configurationId, value })
    .onConflictDoUpdate({
      target: [
        storeConfigurationsTable.storeId,
        storeConfigurationsTable.configurationId,
      ],
      set: { value },
    })
}

export const addStoreFile = async (values: InsertStoreFile) => {
  const storeFilesColumns = getTableColumnsWithExclusions(storeFilesTable, [
    storeFilesTable.createdAt,
    storeFilesTable.updatedAt,
  ])

  const [createdFile] = await db
    .insert(storeFilesTable)
    .values(values)
    .returning({ ...storeFilesColumns })
  return createdFile
}

export const validateAdminAccess = async () => {
  const user = await getAuthenticatedUser()
  console.log('user', user)
  if (!user) redirect('/login', RedirectType.replace)

  const isAdmin = await isUserAdminOfAnyStore(user.id)
  if (!isAdmin) redirect('/unauthorized', RedirectType.replace)
}
