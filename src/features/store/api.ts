'use server'
import {
  getUserStorePermissions,
  isUserAdminOfAnyStore,
} from '@/features/store/db'
import { requireAuth } from '@/services/auth'
import { db } from '@/services/db'
import { configurationsTable } from '@/services/db/schema/configurations'
import { storeConfigurationsTable } from '@/services/db/schema/store-configurations'
import {
  InsertStoreFile,
  storeFilesTable,
} from '@/services/db/schema/store-files'
import { storesTable } from '@/services/db/schema/stores'
import { userStorePermissionsTable } from '@/services/db/schema/user-store-permissions'
import { coalesce, getTableColumnsWithExclusions } from '@/services/db/utils'
import { and, eq, getTableColumns } from 'drizzle-orm'
import { redirect, RedirectType } from 'next/navigation'
import { PermissionsError } from './errors'
import { UserStoreRole } from './types'

export const getAvailableStores = async () => {
  const user = await requireAuth()

  return await db
    .select(getTableColumns(storesTable))
    .from(storesTable)
    .innerJoin(
      userStorePermissionsTable,
      and(
        eq(userStorePermissionsTable.storeId, storesTable.id),
        eq(userStorePermissionsTable.userId, user.id)
      )
    )
}

export const getStoreConfigurations = async (storeId: number) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  return await db
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
}

export const updateStoreConfiguration = async (
  storeId: number,
  configurationId: number,
  value: string
) => {
  await validateUserPermissionsForStore(storeId, 'admin')

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
  const { storePermissions: userStorePermissions } =
    await validateUserPermissionsForStore(values.storeId, 'admin')

  if (userStorePermissions.userId !== values.creatorId)
    throw new PermissionsError({
      type: 'USER_CONFLICT',
      message: 'Criador do arquivo não é o mesmo usuário',
    })

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
  const user = await requireAuth()

  const isAdmin = await isUserAdminOfAnyStore(user.id)
  if (!isAdmin) redirect('/unauthorized', RedirectType.replace)
}

export const validateUserPermissionsForStore = async (
  storeId: number,
  role: UserStoreRole
) => {
  const user = await requireAuth()

  const userPermissionsForStore = await getUserStorePermissions(
    user.id,
    storeId
  )

  if (userPermissionsForStore?.role !== role)
    throw new PermissionsError({
      type: 'FORBIDDEN',
      message: 'Usuário não possui permissão para executar operação na loja',
    })

  return { user, storePermissions: userPermissionsForStore }
}
