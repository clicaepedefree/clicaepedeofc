'use server'

import { getUserByClerkId } from '@/features/user/db'
import type { SelectUser } from '@/services/db/schema'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { AuthError } from './authErrors'

export type AuthenticatedUser = SelectUser

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const clerkUserAuth = await auth()

  if (!clerkUserAuth.userId) {
    throw new AuthError({ type: 'NOT_AUTHENTICATED' })
  }

  const authenticatedUser = await getUserByClerkId(clerkUserAuth.userId)
  if (!authenticatedUser) {
    throw new AuthError({ type: 'MISSING_ONBOARDING' })
  }

  return authenticatedUser
}

export const requireAuth = async () => {
  try {
    const user = await getAuthenticatedUser()
    return user
  } catch (error) {
    if (error instanceof AuthError) {
      error.type === 'MISSING_ONBOARDING' && redirect('/admin-onboarding')
      error.type === 'NOT_AUTHENTICATED' && redirect('/login')
    }

    throw error
  }
}
