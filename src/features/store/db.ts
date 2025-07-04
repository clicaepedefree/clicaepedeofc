'use server'
import { db } from '@/services/db'
import { userStorePermissionsTable } from '@/services/db/schema/user-store-permissions'
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
