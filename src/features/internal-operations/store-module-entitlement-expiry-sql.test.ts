import { describe, expect, test } from 'bun:test'
import {
  buildActiveStoreModuleEntitlementWindowSql,
  buildStoreModuleEntitlementExpirySql,
} from './store-module-entitlement-expiry-sql'

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

  test('serializes the active entitlement comparison timestamp before casting it for Postgres', () => {
    const now = new Date('2026-08-30T03:56:46.000Z')
    const expression = buildActiveStoreModuleEntitlementWindowSql(now)
    const chunks = expression.queryChunks
    const stringChunks = chunks
      .filter(chunk => chunk?.constructor.name === 'StringChunk')
      .flatMap(chunk => (chunk as { value?: string[] }).value ?? [])
      .join('')

    expect(chunks).toContain(now.toISOString())
    expect(chunks).not.toContain(now)
    expect(stringChunks).toContain('is null')
    expect(stringChunks).toContain('::timestamptz')
  })
})
