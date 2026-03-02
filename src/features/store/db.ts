'use server'
import { db } from '@/services/db'
import {
  InsertStoreFile,
  storeFilesTable,
} from '@/services/db/schema/store-files'
import { userStorePermissionsTable } from '@/services/db/schema/user-store-permissions'
import { getTableColumnsWithExclusions } from '@/services/db/utils'
import { and, eq } from 'drizzle-orm'

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
