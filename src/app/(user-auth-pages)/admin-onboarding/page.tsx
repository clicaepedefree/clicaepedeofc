'use server'

import { createOrUpdateUserFromLogin, finishUserOnboarding } from '@/features/user/api'
import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function Onboarding() {
  const clerkUser = await currentUser()

  if (!clerkUser) {
    redirect('/login')
  }

  await createOrUpdateUserFromLogin(clerkUser)

  if (!clerkUser.publicMetadata.onboardingComplete) {
    await finishUserOnboarding(clerkUser)
  }

  redirect('/dashboard')
}
