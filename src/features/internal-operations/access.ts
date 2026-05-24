import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export const internalRoles = ['viewer', 'support', 'ops_admin'] as const

export type InternalRole = (typeof internalRoles)[number]

const roleRank: Record<InternalRole, number> = {
  viewer: 1,
  support: 2,
  ops_admin: 3,
}

export type InternalOperator = {
  clerkId: string
  email: string
  name: string | null
  role: InternalRole
}

export function parseInternalRole(value: unknown): InternalRole | null {
  if (typeof value !== 'string') return null
  if (!internalRoles.includes(value as InternalRole)) return null

  return value as InternalRole
}

export function canUseInternalRole({
  currentRole,
  minimumRole,
}: {
  currentRole: InternalRole | null
  minimumRole: InternalRole
}) {
  if (!currentRole) return false

  return roleRank[currentRole] >= roleRank[minimumRole]
}

export async function getInternalOperator(): Promise<InternalOperator | null> {
  const clerkUser = await currentUser()

  if (!clerkUser) return null

  const role = parseInternalRole(clerkUser.privateMetadata.internalRole)
  if (!role) return null

  const primaryEmailAddress = clerkUser.emailAddresses.find(
    emailAddress => emailAddress.id === clerkUser.primaryEmailAddressId
  )

  if (!primaryEmailAddress) return null

  return {
    clerkId: clerkUser.id,
    email: primaryEmailAddress.emailAddress.toLowerCase(),
    name: clerkUser.fullName,
    role,
  }
}

export async function requireInternalOperator(
  minimumRole: InternalRole
): Promise<InternalOperator> {
  const operator = await getInternalOperator()

  if (
    !operator ||
    !canUseInternalRole({ currentRole: operator.role, minimumRole })
  ) {
    redirect('/unauthorized')
  }

  return operator
}
