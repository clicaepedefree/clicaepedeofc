import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const STORE_ACCESS_INVITE_TTL_DAYS = 7
export const STORE_ACCESS_INVITE_TOKEN_BYTES = 32
export const STORE_ACCESS_INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export type StoreAccessInviteState = {
  status: 'pending' | 'used' | 'revoked'
  expiresAt: Date
  usedAt?: Date | null
  revokedAt?: Date | null
}

export type StoreAccessInviteValidation =
  | { valid: true }
  | { valid: false; reason: 'malformed' | 'expired' | 'used' | 'revoked' }

export function createStoreAccessInviteToken() {
  return randomBytes(STORE_ACCESS_INVITE_TOKEN_BYTES).toString('base64url')
}

export function isStoreAccessInviteToken(token: string) {
  return STORE_ACCESS_INVITE_TOKEN_PATTERN.test(token)
}

export function hashStoreAccessInviteToken(token: string, secret: string) {
  return createHmac('sha256', secret).update(token).digest('hex')
}

export function getStoreAccessInviteSecret() {
  return (
    process.env.STORE_ACCESS_INVITE_SECRET ??
    process.env.CLERK_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    (process.env.NODE_ENV === 'production'
      ? (() => {
          throw new Error('STORE_ACCESS_INVITE_SECRET_NOT_CONFIGURED')
        })()
      : 'store-access-invite-development-secret')
  )
}

export function storeAccessInviteTokenMatches({
  token,
  expectedHash,
  secret,
}: {
  token: string
  expectedHash: string
  secret: string
}) {
  if (!isStoreAccessInviteToken(token)) return false

  const actual = Buffer.from(hashStoreAccessInviteToken(token, secret), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')

  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function getStoreAccessInviteExpiresAt(now = new Date()) {
  const expiresAt = new Date(now)
  expiresAt.setUTCDate(expiresAt.getUTCDate() + STORE_ACCESS_INVITE_TTL_DAYS)
  return expiresAt
}

export function validateStoreAccessInviteState(
  invite: StoreAccessInviteState,
  now = new Date()
): StoreAccessInviteValidation {
  if (invite.status === 'used' || invite.usedAt) {
    return { valid: false, reason: 'used' }
  }

  if (invite.status === 'revoked' || invite.revokedAt) {
    return { valid: false, reason: 'revoked' }
  }

  if (invite.expiresAt <= now) {
    return { valid: false, reason: 'expired' }
  }

  return { valid: true }
}

export function buildStoreAccessInvitePath(token: string) {
  if (!isStoreAccessInviteToken(token)) {
    throw new Error('INVALID_STORE_ACCESS_INVITE_TOKEN')
  }

  return `/convite/${token}`
}

export function buildStoreAccessInviteUrl({
  token,
  baseUrl,
}: {
  token: string
  baseUrl: string
}) {
  const path = buildStoreAccessInvitePath(token)
  return new URL(path, baseUrl).toString()
}
