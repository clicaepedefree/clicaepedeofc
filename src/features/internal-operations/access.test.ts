import { describe, expect, test } from 'bun:test'
import { canUseInternalRole, parseInternalRole } from './access'

describe('internal operation access policy', () => {
  test('accepts only known internal roles', () => {
    expect(parseInternalRole('viewer')).toBe('viewer')
    expect(parseInternalRole('support')).toBe('support')
    expect(parseInternalRole('ops_admin')).toBe('ops_admin')
    expect(parseInternalRole('admin')).toBe(null)
    expect(parseInternalRole(undefined)).toBe(null)
  })

  test('enforces role hierarchy for internal actions', () => {
    expect(canUseInternalRole({ currentRole: 'viewer', minimumRole: 'viewer' })).toBe(true)
    expect(canUseInternalRole({ currentRole: 'viewer', minimumRole: 'support' })).toBe(false)
    expect(canUseInternalRole({ currentRole: 'support', minimumRole: 'viewer' })).toBe(true)
    expect(canUseInternalRole({ currentRole: 'support', minimumRole: 'ops_admin' })).toBe(false)
    expect(canUseInternalRole({ currentRole: 'ops_admin', minimumRole: 'support' })).toBe(true)
    expect(canUseInternalRole({ currentRole: null, minimumRole: 'viewer' })).toBe(false)
  })
})
