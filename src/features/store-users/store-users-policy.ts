export const storeUserRoleOptions = [
  {
    value: 'owner',
    label: 'Proprietário',
    shortLabel: 'Gestão total',
    description: 'Acesso total, gestão de equipe e regras protegidas da loja.',
  },
  {
    value: 'manager',
    label: 'Gerente',
    shortLabel: 'Operação',
    description:
      'Gerencia cardápio, pedidos, caixa, relatórios e configurações operacionais.',
  },
  {
    value: 'attendant',
    label: 'Atendente',
    shortLabel: 'Pedidos',
    description: 'Acompanha e atualiza pedidos de clientes.',
  },
  {
    value: 'cashier',
    label: 'Caixa',
    shortLabel: 'PDV',
    description: 'Opera caixa, PDV e pedidos relacionados ao atendimento.',
  },
  {
    value: 'waiter',
    label: 'Garçom',
    shortLabel: 'Salão',
    description:
      'Lança e acompanha pedidos de mesa quando o salão estiver ativo.',
  },
  {
    value: 'courier',
    label: 'Entregador',
    shortLabel: 'Entregas',
    description: 'Acompanha entregas e atualização de status de rota.',
  },
] as const satisfies ReadonlyArray<{
  value: string
  label: string
  shortLabel: string
  description: string
}>

export type StoreUserRole = (typeof storeUserRoleOptions)[number]['value']

export const storePermissionOptions = [
  'store.access',
  'store.settings.manage',
  'store.users.manage',
  'menu.manage',
  'orders.manage',
  'pos.operate',
  'fiscal.manage',
  'integrations.manage',
  'reports.view',
  'delivery.operate',
] as const

export type StorePermission = (typeof storePermissionOptions)[number]

const allStorePermissions = [...storePermissionOptions]

export const storeRolePermissionMap: Record<StoreUserRole, StorePermission[]> =
  {
    owner: allStorePermissions,
    manager: [
      'store.access',
      'store.settings.manage',
      'menu.manage',
      'orders.manage',
      'pos.operate',
      'fiscal.manage',
      'integrations.manage',
      'reports.view',
      'delivery.operate',
    ],
    attendant: ['store.access', 'orders.manage'],
    cashier: ['store.access', 'orders.manage', 'pos.operate'],
    waiter: ['store.access', 'orders.manage', 'pos.operate'],
    courier: ['store.access', 'delivery.operate'],
  }

export function normalizeStoreUserRole(
  role: StoreUserRole | 'admin'
): StoreUserRole {
  return role === 'admin' ? 'owner' : role
}

export function roleHasStorePermission(
  role: StoreUserRole | 'admin',
  permission: StorePermission
) {
  return storeRolePermissionMap[normalizeStoreUserRole(role)].includes(
    permission
  )
}

export function getStoreUserRoleOption(role: StoreUserRole | 'admin') {
  const normalizedRole = normalizeStoreUserRole(role)

  return (
    storeUserRoleOptions.find(option => option.value === normalizedRole) ??
    storeUserRoleOptions[0]
  )
}

export type StoreUserAccessState = {
  userId: string
  role: StoreUserRole
  isPrimaryResponsible: boolean
  revokedAt: Date | null
  blockedAt?: Date | null
  userStatus: 'active' | 'deleted'
}

export function getActiveStoreUsers(users: StoreUserAccessState[]) {
  return users.filter(
    user => !user.revokedAt && !user.blockedAt && user.userStatus === 'active'
  )
}

export function assertCanRevokeStoreUser({
  targetUserId,
  users,
}: {
  targetUserId: string
  users: StoreUserAccessState[]
}) {
  const activeUsers = getActiveStoreUsers(users)
  const target = activeUsers.find(user => user.userId === targetUserId)

  if (!target) throw new Error('STORE_USER_NOT_ACTIVE')
  if (activeUsers.length <= 1) throw new Error('LAST_ACTIVE_STORE_USER')
  if (
    target.role === 'owner' &&
    activeUsers.filter(user => user.role === 'owner').length <= 1
  ) {
    throw new Error('LAST_ACTIVE_STORE_OWNER')
  }
}

export function assertCanBlockStoreUser({
  targetUserId,
  users,
}: {
  targetUserId: string
  users: StoreUserAccessState[]
}) {
  assertCanRevokeStoreUser({ targetUserId, users })
}

export function getFallbackPrimaryResponsibleUserId({
  targetUserId,
  users,
}: {
  targetUserId: string
  users: StoreUserAccessState[]
}) {
  const activeUsers = getActiveStoreUsers(users)
  const target = activeUsers.find(user => user.userId === targetUserId)

  if (!target?.isPrimaryResponsible) return null

  return (
    activeUsers.find(
      user => user.userId !== targetUserId && user.role === 'owner'
    )?.userId ?? null
  )
}

export function assertCanUnsetPrimaryResponsible({
  targetUserId,
  users,
}: {
  targetUserId: string
  users: StoreUserAccessState[]
}) {
  const activeUsers = getActiveStoreUsers(users)
  const target = activeUsers.find(user => user.userId === targetUserId)

  if (!target) throw new Error('STORE_USER_NOT_ACTIVE')
  if (target.isPrimaryResponsible) {
    throw new Error('PRIMARY_RESPONSIBLE_TRANSFER_REQUIRED')
  }
}

export function assertCanChangeStoreUserRole({
  targetUserId,
  nextRole,
  users,
}: {
  targetUserId: string
  nextRole: StoreUserRole
  users: StoreUserAccessState[]
}) {
  const activeUsers = getActiveStoreUsers(users)
  const target = activeUsers.find(user => user.userId === targetUserId)

  if (!target) throw new Error('STORE_USER_NOT_ACTIVE')
  if (target.role === nextRole) return

  if (
    target.role === 'owner' &&
    nextRole !== 'owner' &&
    activeUsers.filter(user => user.role === 'owner').length <= 1
  ) {
    throw new Error('LAST_ACTIVE_STORE_OWNER')
  }

  if (nextRole !== 'owner' && target.isPrimaryResponsible) {
    throw new Error('PRIMARY_RESPONSIBLE_TRANSFER_REQUIRED')
  }
}

export function assertCanAssignPrimaryResponsibleRole(role: StoreUserRole) {
  if (role !== 'owner') {
    throw new Error('PRIMARY_RESPONSIBLE_REQUIRES_OWNER')
  }
}
