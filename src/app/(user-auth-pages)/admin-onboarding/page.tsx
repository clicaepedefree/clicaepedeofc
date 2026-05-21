'use server'

import {
  createOrUpdateUserFromLogin,
  finishUserOnboarding,
} from '@/features/user/api'
import { getRecoverableStoresForCurrentUserEmail } from '@/features/store/api'
import { isUserAdminOfAnyStore } from '@/features/store/db'
import { AdminOnboardingForm } from '@/features/store/components/admin-onboarding-form'
import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function Onboarding() {
  const clerkUser = await currentUser()

  if (!clerkUser) {
    redirect('/login')
  }

  const user = await createOrUpdateUserFromLogin(clerkUser)

  const hasAdminStore = await isUserAdminOfAnyStore(user.id)

  if (hasAdminStore) {
    if (
      !clerkUser.publicMetadata.onboardingComplete ||
      clerkUser.publicMetadata.userId !== user.id
    ) {
      await finishUserOnboarding(user.id)
    }

    redirect('/dashboard')
  }

  const recoverableStores = await getRecoverableStoresForCurrentUserEmail()

  return <AdminOnboardingForm recoverableStores={recoverableStores} />
}
