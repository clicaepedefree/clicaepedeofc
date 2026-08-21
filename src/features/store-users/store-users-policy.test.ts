import {
  assertCanRevokeStoreUser,
  assertCanUnsetPrimaryResponsible,
  getFallbackPrimaryResponsibleUserId,
  type StoreUserAccessState,
} from './store-users-policy'

const active = (
  userId: string,
  isPrimaryResponsible = false
): StoreUserAccessState => ({
  userId,
  isPrimaryResponsible,
  revokedAt: null,
  userStatus: 'active',
})

describe('store users policy', () => {
  test('blocks revoking the last active admin', () => {
    expect(() =>
      assertCanRevokeStoreUser({
        targetUserId: 'user-1',
        users: [active('user-1', true)],
      })
    ).toThrow('LAST_ACTIVE_STORE_ADMIN')
  })

  test('allows revoking one admin when another active admin remains', () => {
    expect(() =>
      assertCanRevokeStoreUser({
        targetUserId: 'user-1',
        users: [active('user-1', true), active('user-2')],
      })
    ).not.toThrow()
  })

  test('chooses another active admin when revoking the primary responsible', () => {
    expect(
      getFallbackPrimaryResponsibleUserId({
        targetUserId: 'user-1',
        users: [active('user-1', true), active('user-2')],
      })
    ).toBe('user-2')
  })

  test('requires explicit transfer before unsetting the current primary', () => {
    expect(() =>
      assertCanUnsetPrimaryResponsible({
        targetUserId: 'user-1',
        users: [active('user-1', true), active('user-2')],
      })
    ).toThrow('PRIMARY_RESPONSIBLE_TRANSFER_REQUIRED')
  })
})
