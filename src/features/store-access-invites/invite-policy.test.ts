import { describe, expect, test } from 'bun:test'
import {
  buildStoreAccessInvitePath,
  buildStoreAccessInviteUrl,
  createStoreAccessInviteToken,
  getStoreAccessInviteExpiresAt,
  hashStoreAccessInviteToken,
  isStoreAccessInviteToken,
  storeAccessInviteTokenMatches,
  validateStoreAccessInviteState,
} from './invite-policy'

describe('store access invite policy', () => {
  test('creates an opaque base64url token and stores only a deterministic HMAC', () => {
    const token = createStoreAccessInviteToken()
    const hash = hashStoreAccessInviteToken(token, 'secret-a')

    expect(isStoreAccessInviteToken(token)).toBe(true)
    expect(hash).toHaveLength(64)
    expect(hash.includes(token)).toBe(false)
    expect(
      storeAccessInviteTokenMatches({
        token,
        expectedHash: hash,
        secret: 'secret-a',
      })
    ).toBe(true)
    expect(
      storeAccessInviteTokenMatches({
        token,
        expectedHash: hash,
        secret: 'secret-b',
      })
    ).toBe(false)
  })

  test('rejects malformed, used, revoked and expired invites', () => {
    const now = new Date('2026-08-16T12:00:00.000Z')

    expect(isStoreAccessInviteToken('abc')).toBe(false)
    expect(
      validateStoreAccessInviteState(
        {
          status: 'pending',
          expiresAt: new Date('2026-08-16T11:59:59.000Z'),
        },
        now
      )
    ).toEqual({ valid: false, reason: 'expired' })
    expect(
      validateStoreAccessInviteState(
        {
          status: 'used',
          expiresAt: new Date('2026-08-17T12:00:00.000Z'),
        },
        now
      )
    ).toEqual({ valid: false, reason: 'used' })
    expect(
      validateStoreAccessInviteState(
        {
          status: 'revoked',
          expiresAt: new Date('2026-08-17T12:00:00.000Z'),
        },
        now
      )
    ).toEqual({ valid: false, reason: 'revoked' })
  })

  test('builds invite expiration and public URL without exposing implementation details', () => {
    const now = new Date('2026-08-16T12:00:00.000Z')
    const token = createStoreAccessInviteToken()

    expect(getStoreAccessInviteExpiresAt(now).toISOString()).toBe(
      '2026-08-23T12:00:00.000Z'
    )
    expect(buildStoreAccessInvitePath(token)).toBe(`/convite/${token}`)
    expect(
      buildStoreAccessInviteUrl({
        token,
        baseUrl: 'https://clicaepedeofc.vercel.app',
      })
    ).toBe(`https://clicaepedeofc.vercel.app/convite/${token}`)
  })
})
