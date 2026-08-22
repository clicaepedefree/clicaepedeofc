import { getUserByClerkId } from '@/features/user/db'
import { hasAnyActiveStoreAccess } from '@/features/store/db'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

/**
 * Root page handler.
 *
 * Redirects users based on authentication state:
 * - Authenticated with onboarding complete → /dashboard
 * - Authenticated without onboarding → /admin-onboarding
 * - Not authenticated → /login
 *
 * Works on both main domain and admin subdomain.
 */
export default async function Home() {
  const clerkAuth = await auth()

  // Not authenticated - redirect to login
  if (!clerkAuth.userId) {
    redirect('/login')
  }

  // Check if user has completed onboarding
  const user = await getUserByClerkId(clerkAuth.userId)

  if (!user) {
    // Authenticated but no user record - needs onboarding
    redirect('/admin-onboarding')
  }

  const hasActiveStoreAccess = await hasAnyActiveStoreAccess(user.id)

  if (!hasActiveStoreAccess) {
    redirect('/admin-onboarding')
  }

  // Authenticated with complete onboarding - go to dashboard
  redirect('/dashboard')
}
