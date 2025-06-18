'use server'

import { clerkClient, User as ClerkUser } from '@clerk/nextjs/server'
import { createOrUpdateUser } from './db'

export const createOrUpdateUserFromLogin = async (clerkUser: ClerkUser) => {
  const primaryEmailAddressId = clerkUser.primaryEmailAddressId
  if (!primaryEmailAddressId) throw new Error('Primary email address not found')

  const primaryEmailAddress = clerkUser.emailAddresses.find(emailAddress => emailAddress.id === primaryEmailAddressId)

  if (!primaryEmailAddress) throw new Error('Primary email address not found')

  const userInfoToUpsert = {
    clerkId: clerkUser.id,
    email: primaryEmailAddress.emailAddress,
    name: clerkUser.fullName,
  }

  return await createOrUpdateUser(userInfoToUpsert)
}

export const finishUserOnboarding = async (clerkUser: ClerkUser) => {
  // TODO accept admin invitations
  const client = await clerkClient()

  const response = await client.users.updateUser(clerkUser.id, {
    publicMetadata: {
      onboardingComplete: true,
    },
  })
  console.log('response', response)
}
