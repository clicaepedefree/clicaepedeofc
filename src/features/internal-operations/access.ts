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
  'view_personal_data',
  'export_personal_data',
  'create_store',
  'manage_store_profile',
  'manage_implementation_checklist',
  'activate_implemented_store',
  'manage_store_lifecycle',
  'reactivate_store',
  'archive_store',
  'manage_billing_values',
  'manage_billing_invoices',
  'apply_billing_discounts',
  'cancel_billing',
  'manage_store_modules',
  'block_store',
] as const

export type InternalPermission = (typeof internalPermissions)[number]

const rolePermissionMap: Record<
  InternalRole,
  ReadonlySet<InternalPermission>
> = {
  superadmin: new Set(internalPermissions),
  finance: new Set([
    'view_internal_operations',
    'manage_billing_values',
    'manage_billing_invoices',
    'apply_billing_discounts',
    'cancel_billing',
    'manage_store_modules',
  ]),
  support: new Set([
    'view_internal_operations',
    'reactivate_store',
    'block_store',
  ]),
  sales: new Set([
    'view_internal_operations',
    'view_personal_data',
    'create_store',
    'manage_store_profile',
    'manage_implementation_checklist',
    'manage_store_lifecycle',
    'apply_billing_discounts',
    'manage_store_modules',
  ]),
  implementation: new Set([
    'view_internal_operations',
    'view_personal_data',
    'manage_store_profile',
    'manage_implementation_checklist',
    'activate_implemented_store',
    'manage_store_lifecycle',
    'reactivate_store',
    'manage_store_modules',
  ]),
  viewer: new Set(['view_internal_operations']),
}

export type InternalOperator = {
  clerkId: string
  email: string
  name: string | null
  role: InternalRole
}

export const internalOperationsRolloutModes = ['off', 'pilot', 'all'] as const

export type InternalOperationsRolloutMode =
  (typeof internalOperationsRolloutModes)[number]

export type InternalOperationsRolloutConfig = {
  mode: InternalOperationsRolloutMode
  pilotEmails: ReadonlySet<string>
  pilotRoles: ReadonlySet<InternalRole>
}

const splitRolloutList = (value: string | null | undefined) =>
  (value ?? '')
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)

export function parseInternalOperationsRolloutMode(
  value: unknown
): InternalOperationsRolloutMode {
  if (typeof value !== 'string') return 'all'

  const normalized = value.trim().toLowerCase()
  if (!normalized) return 'all'

  return internalOperationsRolloutModes.includes(
    normalized as InternalOperationsRolloutMode
  )
    ? (normalized as InternalOperationsRolloutMode)
    : 'off'
}

export function resolveInternalOperationsRolloutConfig(
  env: Record<string, string | undefined> = process.env
): InternalOperationsRolloutConfig {
  return {
    mode: parseInternalOperationsRolloutMode(
      env.INTERNAL_OPERATIONS_ROLLOUT_MODE
    ),
    pilotEmails: new Set(splitRolloutList(env.INTERNAL_OPERATIONS_PILOT_EMAILS)),
    pilotRoles: new Set(
      splitRolloutList(env.INTERNAL_OPERATIONS_PILOT_ROLES)
        .map(parseInternalRole)
        .filter((role): role is InternalRole => role !== null)
    ),
  }
}

export function isInternalOperationsRolloutAllowed({
  operator,
  config = resolveInternalOperationsRolloutConfig(),
}: {
  operator: Pick<InternalOperator, 'email' | 'role'> | null
  config?: InternalOperationsRolloutConfig
}) {
  if (!operator) return false
  if (config.mode === 'off') return false
  if (config.mode === 'all') return true

  return (
    config.pilotEmails.has(operator.email.trim().toLowerCase()) ||
    config.pilotRoles.has(operator.role)
  )
}

export function canAccessInternalOperations({
  operator,
  config,
}: {
  operator: Pick<InternalOperator, 'email' | 'role'> | null
  config?: InternalOperationsRolloutConfig
}) {
  return (
    isInternalOperationsRolloutAllowed({ operator, config }) &&
    canUseInternalPermission({
      currentRole: operator?.role ?? null,
      permission: 'view_internal_operations',
    })
  )
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

export function canUseAnyInternalPermission({
  operator,
  permissions,
  config,
}: {
  operator: Pick<InternalOperator, 'email' | 'role'> | null
  permissions: readonly InternalPermission[]
  config?: InternalOperationsRolloutConfig
}) {
  return (
    isInternalOperationsRolloutAllowed({ operator, config }) &&
    permissions.some(permission =>
      canUseInternalPermission({
        currentRole: operator?.role ?? null,
        permission,
      })
    )
  )
}

export function canViewInternalPersonalData(
  operator: Pick<InternalOperator, 'role'> | null
) {
  return canUseInternalPermission({
    currentRole: operator?.role ?? null,
    permission: 'view_personal_data',
  })
}

export function canExportInternalPersonalData(
  operator: Pick<InternalOperator, 'role'> | null
) {
  return canUseInternalPermission({
    currentRole: operator?.role ?? null,
    permission: 'export_personal_data',
  })
}

export function requireInternalPersonalDataExportPermission(
  operator: Pick<InternalOperator, 'role'> | null
) {
  if (!canExportInternalPersonalData(operator)) {
    throw new Error('INTERNAL_PERSONAL_DATA_EXPORT_FORBIDDEN')
  }
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
    console.error(
      '[internal-operations] Failed to resolve internal operator',
      error
    )
    return null
  }
}

export async function requireInternalPermission(
  permission: InternalPermission
): Promise<InternalOperator> {
  const operator = await getInternalOperator()

  if (
    !operator ||
    !isInternalOperationsRolloutAllowed({ operator }) ||
    !canUseInternalPermission({ currentRole: operator.role, permission })
  ) {
    redirect('/unauthorized')
  }

  return operator
}

export async function requireAnyInternalPermission(
  permissions: readonly InternalPermission[]
): Promise<InternalOperator> {
  const operator = await getInternalOperator()

  if (!operator || !canUseAnyInternalPermission({ operator, permissions })) {
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
    !isInternalOperationsRolloutAllowed({ operator }) ||
    !canUseInternalRole({ currentRole: operator.role, minimumRole })
  ) {
    redirect('/unauthorized')
  }

  return operator
}
