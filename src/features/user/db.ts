'use server'

import { db } from '@/services/db'
import type { InsertUser } from '@/services/db/schema'
import {
  storesTable,
  userStorePermissionsTable,
  usersTable,
} from '@/services/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import {
  assertClerkLoginCanUseEmail,
  normalizeUserEmail,
} from './user-policy'

type ClerkLoginUserInfo = InsertUser & {
  clerkId: string
  email: string
}

const activeEmailFilter = (email: string) =>
  and(
    eq(usersTable.status, 'active'),
    sql`lower(${usersTable.email}) = ${normalizeUserEmail(email)}`
  )

export const createOrUpdateUser = async (userInfo: ClerkLoginUserInfo) => {
  const normalizedUserInfo = {
    ...userInfo,
    email: normalizeUserEmail(userInfo.email),
    status: 'active' as const,
    deletedAt: null,
    lastLoginAt: new Date(),
  }

  const [existingUserByClerkId] = await db
    .select()
    .from(usersTable)
    .where(
      and(
        eq(usersTable.clerkId, normalizedUserInfo.clerkId),
        eq(usersTable.status, 'active')
      )
    )

  const [activeUserByEmail] = await db
    .select()
    .from(usersTable)
    .where(activeEmailFilter(normalizedUserInfo.email))

  assertClerkLoginCanUseEmail({
    existingUserByClerkId: existingUserByClerkId ?? null,
    activeUserByEmail: activeUserByEmail ?? null,
  })

  if (existingUserByClerkId) {
    const [updatedUser] = await db
      .update(usersTable)
      .set(normalizedUserInfo)
      .where(eq(usersTable.id, existingUserByClerkId.id))
      .returning()

    return updatedUser
  }

  const [createdOrUpdatedUser] = await db
    .insert(usersTable)
    .values(normalizedUserInfo)
    .returning()

  return createdOrUpdatedUser
}

export const getUserByClerkId = async (clerkId: string) => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.clerkId, clerkId), eq(usersTable.status, 'active')))

  return user ?? null
}

export const handleClerkUserDeleted = async (clerkId: string) => {
  return await db.transaction(async tx => {
    const [user] = await tx
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.clerkId, clerkId), eq(usersTable.status, 'active')))

    if (!user) {
      return {
        userFound: false,
        storesMovedToRecovery: 0,
      }
    }

    const now = new Date()
    const administeredStores = await tx
      .select({ storeId: userStorePermissionsTable.storeId })
      .from(userStorePermissionsTable)
      .where(
        and(
          eq(userStorePermissionsTable.userId, user.id),
          eq(userStorePermissionsTable.role, 'owner'),
          sql`${userStorePermissionsTable.revokedAt} is null`
        )
      )

    await tx
      .update(usersTable)
      .set({
        clerkId: null,
        status: 'deleted',
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(usersTable.id, user.id))

    await tx
      .update(userStorePermissionsTable)
      .set({
        revokedAt: now,
        revokedReason: 'clerk_user_deleted',
        updatedAt: now,
      })
      .where(
        and(
          eq(userStorePermissionsTable.userId, user.id),
          sql`${userStorePermissionsTable.revokedAt} is null`
        )
      )

    let storesMovedToRecovery = 0

    for (const { storeId } of administeredStores) {
      const activeAdmins = await tx
        .select({ userId: userStorePermissionsTable.userId })
        .from(userStorePermissionsTable)
        .innerJoin(
          usersTable,
          eq(usersTable.id, userStorePermissionsTable.userId)
        )
        .where(
          and(
            eq(userStorePermissionsTable.storeId, storeId),
            eq(userStorePermissionsTable.role, 'owner'),
            sql`${userStorePermissionsTable.revokedAt} is null`,
            eq(usersTable.status, 'active')
          )
        )
        .limit(1)

      if (activeAdmins.length > 0) continue

      await tx
        .update(storesTable)
        .set({
          status: 'pending_recovery',
          statusReason: 'admin_user_deleted',
          statusUpdatedAt: now,
          updatedAt: now,
        })
        .where(eq(storesTable.id, storeId))

      storesMovedToRecovery += 1
    }

    return {
      userFound: true,
      storesMovedToRecovery,
    }
  })
}
