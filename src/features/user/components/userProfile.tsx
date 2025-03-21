'use client'

import { SignedIn, UserButton } from '@clerk/nextjs'
import { StandardLonghandProperties } from 'csstype'

type UserProfileProps = {
  showName?: boolean
  className?: StandardLonghandProperties
}

export const UserProfile = ({ showName, className = {} }: UserProfileProps) => {
  return (
    <SignedIn>
      <UserButton
        appearance={{
          elements: {
            userButtonPopoverFooter: { display: 'none' },
            userButtonBox: { flexDirection: 'row-reverse', alignSelf: 'center' },
            rootBox: className,
          },
        }}
        showName={showName}
      />
    </SignedIn>
  )
}
