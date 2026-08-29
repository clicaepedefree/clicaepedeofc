import { describe, expect, test } from 'bun:test'
import { buildStoreModuleEntitlementExpirySql } from './store-module-entitlement-expiry-sql'

describe('store module entitlement expiry SQL', () => {
  test('serializes now as an ISO timestamp before casting it for Postgres', () => {
    const now = new Date('2026-08-29T12:00:00.000Z')
    const expression = buildStoreModuleEntitlementExpirySql(now)
    const chunks = expression.queryChunks

    expect(chunks[0]?.constructor.name).toBe('StringChunk')
    expect(chunks[1]).toBe(now.toISOString())
    expect(chunks[1]).not.toBeInstanceOf(Date)
    expect(chunks[2]?.constructor.name).toBe('StringChunk')
    expect((chunks[2] as { value?: string[] }).value).toEqual([
      '::timestamptz, ',
    ])
  })
})
