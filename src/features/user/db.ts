'use server'

import { db } from '@/services/db'
import type { InsertUser } from '@/services/db/schema'
import { usersTable } from '@/services/db/schema'
import { eq } from 'drizzle-orm'

export const createOrUpdateUser = async (userInfo: InsertUser) => {
  const [createdOrUpdatedUser] = await db
    .insert(usersTable)
    .values(userInfo)
    .onConflictDoUpdate({
      target: [usersTable.clerkId],
      set: userInfo,
    })
    .returning()

  return createdOrUpdatedUser
}

export const getUserByClerkId = async (clerkId: string) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId))

  return user ?? null
}
