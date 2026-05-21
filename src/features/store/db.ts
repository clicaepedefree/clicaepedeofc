'use server'
import { db } from '@/services/db'
import {
  InsertStoreFile,
  storeFilesTable,
} from '@/services/db/schema/store-files'
import { InsertStore, storesTable } from '@/services/db/schema/stores'
import { userStorePermissionsTable } from '@/services/db/schema/user-store-permissions'
import { getTableColumnsWithExclusions } from '@/services/db/utils'
import { and, eq, sql } from 'drizzle-orm'

const USER_ALREADY_HAS_ADMIN_STORE_ERROR = 'USER_ALREADY_HAS_ADMIN_STORE'

function getUserStoreCreationLockKey(userId: string) {
  let hash = 0

  for (let index = 0; index < userId.length; index++) {
    hash = (hash * 31 + userId.charCodeAt(index)) | 0
  }

  return hash
}

export const isUserAdminOfAnyStore = async (userId: string) => {
  const result = await db.$count(
    userStorePermissionsTable,
    and(
      eq(userStorePermissionsTable.userId, userId),
      eq(userStorePermissionsTable.role, 'admin')
    )
  )

  return result > 0
}

export const getUserStorePermissions = async (
  userId: string,
  storeId: number
) => {
  const [userStoreRole] = await db
    .select()
    .from(userStorePermissionsTable)
    .where(
      and(
        eq(userStorePermissionsTable.userId, userId),
        eq(userStorePermissionsTable.storeId, storeId)
      )
    )

  return userStoreRole
}

export const createStoreWithAdminPermission = async ({
  store,
  userId,
}: {
  store: InsertStore
  userId: string
}) => {
  return await db.transaction(async tx => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${getUserStoreCreationLockKey(userId)})`
    )

    const existingAdminStore = await tx
      .select({ storeId: userStorePermissionsTable.storeId })
      .from(userStorePermissionsTable)
      .where(
        and(
          eq(userStorePermissionsTable.userId, userId),
          eq(userStorePermissionsTable.role, 'admin')
        )
      )
      .limit(1)

    if (existingAdminStore.length > 0) {
      throw new Error(USER_ALREADY_HAS_ADMIN_STORE_ERROR)
    }

    const [createdStore] = await tx
      .insert(storesTable)
      .values(store)
      .returning()

    await tx.insert(userStorePermissionsTable).values({
      userId,
      storeId: createdStore.id,
      role: 'admin',
    })

    return createdStore
  })
}

export const insertStoreFile = async (values: InsertStoreFile) => {
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
