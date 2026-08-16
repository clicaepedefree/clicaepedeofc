'use server'
import { db } from '@/services/db'
import {
  InsertStoreFile,
  storeFilesTable,
} from '@/services/db/schema/store-files'
import { InsertStore, storesTable } from '@/services/db/schema/stores'
import { storeAccessBlocksTable } from '@/services/db/schema/store-access-blocks'
import { userStorePermissionsTable } from '@/services/db/schema/user-store-permissions'
import { usersTable } from '@/services/db/schema/users'
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
  const [store] = await db
    .select({ id: storesTable.id })
    .from(userStorePermissionsTable)
    .innerJoin(
      storesTable,
      eq(storesTable.id, userStorePermissionsTable.storeId)
    )
    .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
    .where(
      and(
        eq(userStorePermissionsTable.userId, userId),
        eq(userStorePermissionsTable.role, 'admin'),
        sql`${userStorePermissionsTable.revokedAt} is null`,
        eq(storesTable.status, 'active'),
        sql`not exists (
          select 1 from ${storeAccessBlocksTable}
          where ${storeAccessBlocksTable.storeId} = ${storesTable.id}
            and ${storeAccessBlocksTable.unblockedAt} is null
            and (
              ${storeAccessBlocksTable.scheduledUnblockAt} is null
              or ${storeAccessBlocksTable.scheduledUnblockAt} > now()
            )
        )`,
        eq(usersTable.status, 'active')
      )
    )
    .limit(1)

  return Boolean(store)
}

export const getUserStorePermissions = async (
  userId: string,
  storeId: number
) => {
  const [userStoreRole] = await db
    .select({
      permission: userStorePermissionsTable,
      store: storesTable,
      activeAccessBlockId: storeAccessBlocksTable.id,
    })
    .from(userStorePermissionsTable)
    .innerJoin(
      storesTable,
      eq(storesTable.id, userStorePermissionsTable.storeId)
    )
    .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
    .leftJoin(
      storeAccessBlocksTable,
      and(
        eq(storeAccessBlocksTable.storeId, storesTable.id),
        sql`${storeAccessBlocksTable.unblockedAt} is null`,
        sql`(${storeAccessBlocksTable.scheduledUnblockAt} is null or ${storeAccessBlocksTable.scheduledUnblockAt} > now())`
      )
    )
    .where(
      and(
        eq(userStorePermissionsTable.userId, userId),
        eq(userStorePermissionsTable.storeId, storeId),
        sql`${userStorePermissionsTable.revokedAt} is null`,
        eq(usersTable.status, 'active')
      )
    )

  return userStoreRole
}

export const getPendingRecoveryStoresByEmail = async (email: string) => {
  return await db
    .select({
      id: storesTable.id,
      name: storesTable.name,
      subdomain: storesTable.subdomain,
      status: storesTable.status,
    })
    .from(storesTable)
    .innerJoin(
      userStorePermissionsTable,
      eq(userStorePermissionsTable.storeId, storesTable.id)
    )
    .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
    .where(
      and(
        eq(storesTable.status, 'pending_recovery'),
        eq(userStorePermissionsTable.role, 'admin'),
        eq(usersTable.status, 'deleted'),
        sql`lower(${usersTable.email}) = ${email.trim().toLowerCase()}`
      )
    )
}

const createStoreWithAdminPermission = async ({
  store,
  userId,
  requireNoExistingAdminStore,
}: {
  store: InsertStore
  userId: string
  requireNoExistingAdminStore: boolean
}) => {
  return await db.transaction(async tx => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${getUserStoreCreationLockKey(userId)})`
    )

    if (requireNoExistingAdminStore) {
      const existingAdminStore = await tx
        .select({ storeId: userStorePermissionsTable.storeId })
        .from(userStorePermissionsTable)
        .where(
          and(
            eq(userStorePermissionsTable.userId, userId),
            eq(userStorePermissionsTable.role, 'admin'),
            sql`${userStorePermissionsTable.revokedAt} is null`
          )
        )
        .limit(1)

      if (existingAdminStore.length > 0) {
        throw new Error(USER_ALREADY_HAS_ADMIN_STORE_ERROR)
      }
    }

    const [createdStore] = await tx
      .insert(storesTable)
      .values(store)
      .returning()

    await tx.insert(userStorePermissionsTable).values({
      userId,
      storeId: createdStore.id,
      role: 'admin',
      isPrimaryResponsible: true,
      assignedPrimaryAt: new Date(),
    })

    return createdStore
  })
}

export const createFirstStoreWithAdminPermission = async ({
  store,
  userId,
}: {
  store: InsertStore
  userId: string
}) => {
  return createStoreWithAdminPermission({
    store,
    userId,
    requireNoExistingAdminStore: true,
  })
}

export const createAdditionalStoreWithAdminPermission = async ({
  store,
  userId,
}: {
  store: InsertStore
  userId: string
}) => {
  return createStoreWithAdminPermission({
    store,
    userId,
    requireNoExistingAdminStore: false,
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
