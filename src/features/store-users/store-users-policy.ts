export type StoreUserAccessState = {
  userId: string
  isPrimaryResponsible: boolean
  revokedAt: Date | null
  userStatus: 'active' | 'deleted'
}

export function getActiveStoreUsers(users: StoreUserAccessState[]) {
  return users.filter(user => !user.revokedAt && user.userStatus === 'active')
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
  if (activeUsers.length <= 1) throw new Error('LAST_ACTIVE_STORE_ADMIN')
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
    activeUsers.find(user => user.userId !== targetUserId)?.userId ?? null
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
