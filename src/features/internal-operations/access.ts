import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export const internalRoles = [
  'superadmin',
  'finance',
  'support',
  'sales',
  'implementation',
  'viewer',
] as const

export type InternalRole = (typeof internalRoles)[number]

export const internalRoleLabels: Record<InternalRole, string> = {
  superadmin: 'Superadmin',
  finance: 'Financeiro',
  support: 'Suporte',
  sales: 'Comercial',
  implementation: 'Implantacao',
  viewer: 'Leitura',
}

export const internalPermissions = [
  'view_internal_operations',
  'reactivate_store',
  'archive_store',
  'manage_billing_values',
  'manage_billing_invoices',
  'apply_billing_discounts',
  'cancel_billing',
  'block_store',
  'view_sensitive_audit_logs',
] as const

export type InternalPermission = (typeof internalPermissions)[number]

const rolePermissionMap: Record<InternalRole, ReadonlySet<InternalPermission>> = {
  superadmin: new Set(internalPermissions),
  finance: new Set([
    'view_internal_operations',
    'manage_billing_values',
    'manage_billing_invoices',
    'apply_billing_discounts',
    'cancel_billing',
    'view_sensitive_audit_logs',
  ]),
  support: new Set([
    'view_internal_operations',
    'reactivate_store',
    'view_sensitive_audit_logs',
  ]),
  sales: new Set([
    'view_internal_operations',
    'apply_billing_discounts',
  ]),
  implementation: new Set([
    'view_internal_operations',
    'reactivate_store',
  ]),
  viewer: new Set(['view_internal_operations']),
}

export type InternalOperator = {
  clerkId: string
  email: string
  name: string | null
  role: InternalRole
}

export function parseInternalRole(value: unknown): InternalRole | null {
  if (typeof value !== 'string') return null

  if (value === 'ops_admin') return 'superadmin'
  if (!internalRoles.includes(value as InternalRole)) return null

  return value as InternalRole
}

export function canUseInternalPermission({
  currentRole,
  permission,
}: {
  currentRole: InternalRole | null
  permission: InternalPermission
}) {
  if (!currentRole) return false

  return rolePermissionMap[currentRole].has(permission)
}

export const canUseInternalRole = ({
  currentRole,
  minimumRole,
}: {
  currentRole: InternalRole | null
  minimumRole: InternalRole
}) => {
  if (!currentRole) return false

  return (
    currentRole === minimumRole ||
    currentRole === 'superadmin' ||
    (minimumRole === 'viewer' &&
      canUseInternalPermission({
        currentRole,
        permission: 'view_internal_operations',
      }))
  )
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

export async function getInternalOperatorSafe(): Promise<InternalOperator | null> {
  try {
    return await getInternalOperator()
  } catch (error) {
    console.error('[internal-operations] Failed to resolve internal operator', error)
    return null
  }
}

export async function requireInternalPermission(
  permission: InternalPermission
): Promise<InternalOperator> {
  const operator = await getInternalOperator()

  if (
    !operator ||
    !canUseInternalPermission({ currentRole: operator.role, permission })
  ) {
    redirect('/unauthorized')
  }

  return operator
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
