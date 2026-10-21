import { describe, expect, test } from 'bun:test'
import { getIntegrationsAccess } from './integrations-access'

const check = (userRole: string | null, overrides = {}) =>
  getIntegrationsAccess({
    stores: [{ id: 9, userRole }],
    selectedStoreId: 9,
    isLoading: false,
    isError: false,
    ...overrides,
  })

describe('integration presentation access', () => {
  test('allows only roles with integrations.manage', () => {
    for (const role of ['owner', 'admin', 'manager'])
      expect(check(role)).toBe('allowed')
    for (const role of ['cashier', 'attendant', 'courier', 'waiter'])
      expect(check(role)).toBe('denied')
  })

  test('fails closed while loading, missing or failed, even with cached owner data', () => {
    expect(check('owner', { isLoading: true })).toBe('loading')
    expect(check('owner', { isError: true })).toBe('unknown')
    expect(check('owner', { selectedStoreId: null })).toBe('unknown')
    expect(check('owner', { selectedStoreId: 10 })).toBe('unknown')
    expect(check('owner', { stores: undefined })).toBe('unknown')
    expect(check(null)).toBe('unknown')
    expect(check('unexpected-role')).toBe('unknown')
  })
})
