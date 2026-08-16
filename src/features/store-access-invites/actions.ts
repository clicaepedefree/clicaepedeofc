'use server'

import { acceptStoreAccessInvite } from '@/features/store-access-invites/db'
import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export async function acceptStoreAccessInviteAction(formData: FormData) {
  const token = formData.get('token')

  if (typeof token !== 'string') {
    redirect('/convite/invalido?error=convite-invalido')
  }

  const clerkUser = await currentUser()
  if (!clerkUser) {
    redirect(`/login?redirect_url=${encodeURIComponent(`/convite/${token}`)}`)
  }

  try {
    await acceptStoreAccessInvite({ token, clerkUser })
  } catch (error) {
    console.error('[store-access-invites] Failed to accept invite', error)
    redirect(`/convite/${token}?error=nao-foi-possivel-aceitar`)
  }

  redirect('/dashboard')
}
