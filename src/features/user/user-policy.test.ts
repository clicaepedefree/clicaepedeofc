import { describe, expect, test } from 'bun:test'
import {
  USER_EMAIL_ALREADY_LINKED_ERROR,
  assertClerkLoginCanUseEmail,
  normalizeUserEmail,
  shouldBlockStoreOperations,
} from './user-policy'

const activeUser = {
  id: 'user-1',
  email: 'dono@loja.com',
  clerkId: 'clerk-1',
  status: 'active' as const,
}

describe('user identity policy', () => {
  test('normalizes emails before persistence', () => {
    expect(normalizeUserEmail('  Dono@Loja.COM ')).toBe('dono@loja.com')
  })

  test('allows the same Clerk identity to keep its active email', () => {
    let thrownError: unknown

    try {
      assertClerkLoginCanUseEmail({
        existingUserByClerkId: activeUser,
        activeUserByEmail: activeUser,
      })
    } catch (error) {
      thrownError = error
    }

    expect(thrownError).toBe(undefined)
  })

  test('blocks automatic reassociation by email for another Clerk identity', () => {
    let thrownError: unknown

    try {
      assertClerkLoginCanUseEmail({
        existingUserByClerkId: null,
        activeUserByEmail: activeUser,
      })
    } catch (error) {
      thrownError = error
    }

    expect(thrownError instanceof Error).toBe(true)
    expect((thrownError as Error).message).toBe(USER_EMAIL_ALREADY_LINKED_ERROR)
  })

  test('blocks store operations when store is not active', () => {
    expect(shouldBlockStoreOperations({ status: 'active' })).toBe(false)
    expect(
      shouldBlockStoreOperations({
        status: 'active',
        hasActiveAccessBlock: true,
      })
    ).toBe(true)
    expect(shouldBlockStoreOperations({ status: 'pending_recovery' })).toBe(true)
    expect(shouldBlockStoreOperations({ status: 'inactive' })).toBe(true)
    expect(shouldBlockStoreOperations({ status: 'archived' })).toBe(true)
  })
})
