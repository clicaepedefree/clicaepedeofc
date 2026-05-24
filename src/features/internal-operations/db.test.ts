import { describe, expect, test } from 'bun:test'
import { parseStoreStatus } from './db'

describe('internal operation store policy', () => {
  test('accepts only known store lifecycle statuses for internal filters', () => {
    expect(parseStoreStatus('active')).toBe('active')
    expect(parseStoreStatus('inactive')).toBe('inactive')
    expect(parseStoreStatus('pending_recovery')).toBe('pending_recovery')
    expect(parseStoreStatus('archived')).toBe('archived')
    expect(parseStoreStatus('deleted')).toBe(undefined)
    expect(parseStoreStatus(undefined)).toBe(undefined)
  })
})
