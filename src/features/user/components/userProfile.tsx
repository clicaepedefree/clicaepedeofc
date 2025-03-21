'use client'

import { SignedIn, UserButton } from '@clerk/nextjs'

export const UserProfile = () => {
  return (
    <SignedIn>
      <UserButton
        appearance={{
          elements: {
            userButtonPopoverFooter: { display: 'none' },
            userButtonBox: { flexDirection: 'row-reverse' },
          },
        }}
        showName
      />
    </SignedIn>
  )
}
