import type { SelectUser } from '@/services/db/schema'

export const USER_EMAIL_ALREADY_LINKED_ERROR = 'USER_EMAIL_ALREADY_LINKED'

type ExistingUserIdentity = Pick<SelectUser, 'id' | 'email' | 'clerkId' | 'status'>

export const normalizeUserEmail = (email: string) => email.trim().toLowerCase()

export function assertClerkLoginCanUseEmail({
  existingUserByClerkId,
  activeUserByEmail,
}: {
  existingUserByClerkId: ExistingUserIdentity | null
  activeUserByEmail: ExistingUserIdentity | null
}) {
  if (!activeUserByEmail) return
  if (existingUserByClerkId?.id === activeUserByEmail.id) return

  throw new Error(USER_EMAIL_ALREADY_LINKED_ERROR)
}

export function shouldBlockStoreOperations({
  status,
  hasActiveAccessBlock = false,
}: {
  status: string
  hasActiveAccessBlock?: boolean
}) {
  return status !== 'active' || hasActiveAccessBlock
}
