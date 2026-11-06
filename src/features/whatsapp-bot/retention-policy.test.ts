import { describe, expect, test } from 'bun:test'
import {
  emptyRetentionCounts,
  retentionScope,
  retentionUuid,
} from './retention-policy'

describe('retention audit boundaries', () => {
  test('never widens an explicit or empty scope', () => {
    const all = { mode: 'all' as const, pilotStoreIds: new Set<number>() }
    expect(retentionScope(undefined, all)).toBeNull()
    expect(retentionScope([], all)).toEqual([])
    expect(retentionScope([12, 9, 12], all)).toEqual([9, 12])
    const pilot = { mode: 'pilot' as const, pilotStoreIds: new Set([9, 11]) }
    expect(retentionScope(undefined, pilot)).toEqual([9, 11])
    expect(retentionScope([11, 12], pilot)).toEqual([11])
    expect(retentionScope([], pilot)).toEqual([])
    expect(retentionScope(undefined, { ...pilot, mode: 'off' })).toEqual([])
  })
  test.each([0, -1, 1.2, NaN, 2147483648])(
    'rejects invalid store identifier %j',
    id => {
      expect(() => retentionScope([id])).toThrow('Invalid retention scope')
    }
  )
  test('technical correlation identifiers cannot contain free-form user data', () => {
    const id = '0e173504-a78d-4ffb-b826-a8d611125e50'
    expect(retentionUuid(id.toUpperCase())).toBe(id)
    for (const value of [
      'customer@example.invalid',
      '5511999999999',
      'Bearer fixture',
      '',
      'invalid',
    ])
      expect(() => retentionUuid(value)).toThrow(
        'Invalid retention execution identifier'
      )
  })
  test('each execution owns independent count projections with fixed keys', () => {
    const a = emptyRetentionCounts(),
      b = emptyRetentionCounts()
    a.deletedContacts = 3
    expect(Object.values(b)).toEqual([0, 0, 0, 0, 0, 0, 0])
    expect(Object.keys(b)).toHaveLength(7)
  })
})
