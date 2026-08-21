import {
  assertCanAssignPrimaryResponsibleRole,
  assertCanChangeStoreUserRole,
  assertCanRevokeStoreUser,
  assertCanUnsetPrimaryResponsible,
  getFallbackPrimaryResponsibleUserId,
  roleHasStorePermission,
  storeUserRoleOptions,
  type StoreUserAccessState,
} from './store-users-policy'

const active = (
  userId: string,
  isPrimaryResponsible = false,
  role: StoreUserAccessState['role'] = 'owner'
): StoreUserAccessState => ({
  userId,
  role,
  isPrimaryResponsible,
  revokedAt: null,
  userStatus: 'active',
})

describe('store users policy', () => {
  test('defines every supported profile once', () => {
    expect(storeUserRoleOptions.map(option => option.value)).toEqual([
      'owner',
      'manager',
      'attendant',
      'cashier',
      'waiter',
      'courier',
    ])
  })

  test('maps sensitive permissions by profile', () => {
    expect(roleHasStorePermission('owner', 'store.users.manage')).toBe(true)
    expect(roleHasStorePermission('manager', 'store.users.manage')).toBe(false)
    expect(roleHasStorePermission('cashier', 'pos.operate')).toBe(true)
    expect(roleHasStorePermission('courier', 'reports.view')).toBe(false)
  })

  test('blocks revoking the last active store user', () => {
    expect(() =>
      assertCanRevokeStoreUser({
        targetUserId: 'user-1',
        users: [active('user-1', true)],
      })
    ).toThrow('LAST_ACTIVE_STORE_USER')
  })

  test('blocks revoking the last active owner even when another profile remains', () => {
    expect(() =>
      assertCanRevokeStoreUser({
        targetUserId: 'user-1',
        users: [active('user-1', true), active('user-2', false, 'manager')],
      })
    ).toThrow('LAST_ACTIVE_STORE_OWNER')
  })

  test('allows revoking one owner when another active owner remains', () => {
    expect(() =>
      assertCanRevokeStoreUser({
        targetUserId: 'user-1',
        users: [active('user-1', true), active('user-2')],
      })
    ).not.toThrow()
  })

  test('chooses another active user when revoking the primary responsible', () => {
    expect(
      getFallbackPrimaryResponsibleUserId({
        targetUserId: 'user-1',
        users: [active('user-1', true), active('user-2')],
      })
    ).toBe('user-2')
  })

  test('chooses only another owner as primary fallback', () => {
    expect(
      getFallbackPrimaryResponsibleUserId({
        targetUserId: 'user-1',
        users: [
          active('user-1', true),
          active('user-2', false, 'manager'),
          active('user-3', false, 'owner'),
        ],
      })
    ).toBe('user-3')
  })

  test('requires explicit transfer before unsetting the current primary', () => {
    expect(() =>
      assertCanUnsetPrimaryResponsible({
        targetUserId: 'user-1',
        users: [active('user-1', true), active('user-2')],
      })
    ).toThrow('PRIMARY_RESPONSIBLE_TRANSFER_REQUIRED')
  })

  test('blocks demoting the last active owner', () => {
    expect(() =>
      assertCanChangeStoreUserRole({
        targetUserId: 'user-1',
        nextRole: 'manager',
        users: [active('user-1'), active('user-2', false, 'cashier')],
      })
    ).toThrow('LAST_ACTIVE_STORE_OWNER')
  })

  test('requires owner profile for primary responsible', () => {
    expect(() => assertCanAssignPrimaryResponsibleRole('manager')).toThrow(
      'PRIMARY_RESPONSIBLE_REQUIRES_OWNER'
    )
    expect(() => assertCanAssignPrimaryResponsibleRole('owner')).not.toThrow()
  })
})
