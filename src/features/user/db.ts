'use server'

import { db } from '@/services/db'
import type { InsertUser } from '@/services/db/schema'
import { usersTable } from '@/services/db/schema'
import { eq } from 'drizzle-orm'

export const createOrUpdateUser = async (userInfo: InsertUser) => {
  const [existingUserByClerkId] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkId, userInfo.clerkId))

  if (existingUserByClerkId) {
    const [updatedUser] = await db
      .update(usersTable)
      .set(userInfo)
      .where(eq(usersTable.id, existingUserByClerkId.id))
      .returning()

    return updatedUser
  }

  const [existingUserByEmail] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, userInfo.email))

  if (existingUserByEmail) {
    const [updatedUser] = await db
      .update(usersTable)
      .set(userInfo)
      .where(eq(usersTable.id, existingUserByEmail.id))
      .returning()

    return updatedUser
  }

  const [createdOrUpdatedUser] = await db.insert(usersTable).values(userInfo).returning()

  return createdOrUpdatedUser
}

export const getUserByClerkId = async (clerkId: string) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId))

  return user ?? null
}
