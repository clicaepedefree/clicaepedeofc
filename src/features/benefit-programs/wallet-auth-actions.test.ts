import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
mock.module('server-only', () => ({}))
let origin = 'https://wallet.example'
let allowed = true,
  exists = true,
  verified = true,
  authenticated = true
let senderMode = 'ack'
const events: string[] = []
const jar = new Map<string, string>()
const cookieWrites: { name: string; value: string; options: unknown }[] = []
const challengeWrites: Record<string, unknown>[] = []
mock.module('next/headers', () => ({
  headers: async () =>
    new Headers({
      origin,
      host: 'wallet.example',
      'sec-fetch-site': 'same-origin',
    }),
  cookies: async () => ({
    get: (name: string) =>
      jar.has(name) ? { value: jar.get(name) } : undefined,
    set: (name: string, value: string, options: unknown) => {
      jar.set(name, value)
      cookieWrites.push({ name, value, options })
    },
  }),
}))
const tx = {
  insert: () => ({
    values: async (value: Record<string, unknown>) => {
      events.push('persist-challenge')
      challengeWrites.push(value)
    },
  }),
  update: () => ({
    set: () => ({
      where: async () => {
        events.push('revoke')
      },
    }),
  }),
}
mock.module('@/services/db', () => ({
  db: {
    transaction: async (run: (session: typeof tx) => unknown) => {
      events.push('tx-start')
      const result = await run(tx)
      events.push('tx-end')
      return result
    },
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            events.push('store-lookup')
            return exists ? [{ id: 9 }] : []
          },
        }),
      }),
    }),
  },
}))
mock.module('./wallet-auth-db', () => ({
  purgeExpiredWalletAuth: async () => { events.push('purge') },
  supersedeWalletChallenges: async () => { events.push('supersede') },
  walletDbNow: async () => new Date('2026-11-03T02:00:00Z'),
  consumeWalletRates: async () => {
    events.push('rates')
    return allowed
  },
  markWalletDelivery: async (_id: string, ack: boolean) => {
    events.push(ack ? 'sent' : 'unknown')
    return true
  },
  verifyWalletChallenge: async () => {
    events.push('verify')
    return verified
  },
}))
mock.module('./wallet-auth-provider', () => ({
  prepareWalletOtpSender: async () => {
    events.push('provider-probe')
    if (senderMode === 'offline') throw new Error('offline')
    return async () => {
      events.push('send')
      if (senderMode === 'timeout') throw new Error('timeout')
      return senderMode === 'ack'
    }
  },
}))
mock.module('./wallet-auth', () => ({
  requireWalletIdentity: async (
    storeId: number,
    phone: string,
    transaction: unknown
  ) => {
    events.push('identity')
    expect(transaction).toBe(tx)
    if (!authenticated) throw new Error('WALLET_AUTH_REQUIRED')
    return { storeId, phone }
  },
}))
mock.module('./ledger', () => ({
  getBenefitAccountSummary: async (
    storeId: number,
    phone: string,
    transaction: unknown
  ) => {
    events.push('balance')
    expect(storeId).toBe(9)
    expect(phone).toBe('5511900000001')
    expect(transaction).toBe(tx)
    return { availableAmount: '12.34', pendingAmount: '5.67' }
  },
}))
mock.module('./product-rewards', () => ({
  listAvailableProductRewards: async (storeId: number, phone: string, transaction: unknown) => {
    events.push('rewards')
    expect(storeId).toBe(9)
    expect(phone).toBe('5511900000001')
    expect(transaction).toBe(tx)
    return [{ rewardId: 'reward-fixture', itemName: 'X-salada', voucherCode: 'FID-fixture', expiresAt: new Date('2026-12-03T12:00:00Z'), state: 'available', canReserve: true, availability: 'available' }]
  },
}))
const a = await import('./wallet-auth-actions')
const input = { storeSlug: 'fixture', phone: '(11) 90000-0001' }
const fixtureWalletHmac = 'a'.repeat(64)
const env = {
  key: process.env.WALLET_AUTH_HMAC_KEY,
  debug: process.env.DRIZZLE_DEBUG,
}
beforeEach(() => {
  process.env.WALLET_AUTH_HMAC_KEY = fixtureWalletHmac
  delete process.env.DRIZZLE_DEBUG
  origin = 'https://wallet.example'
  allowed = exists = verified = authenticated = true
  senderMode = 'ack'
  events.length = cookieWrites.length = challengeWrites.length = 0
  jar.clear()
})
afterEach(() => {
  if (env.key === undefined) delete process.env.WALLET_AUTH_HMAC_KEY
  else process.env.WALLET_AUTH_HMAC_KEY = env.key
  if (env.debug === undefined) delete process.env.DRIZZLE_DEBUG
  else process.env.DRIZZLE_DEBUG = env.debug
})

describe('wallet public action contracts (mock DB and transport; zero real sends)', () => {
  test('persists hashed challenge and commits before probe/send; marks sent only on ACK', async () => {
    const result = await a.requestWalletCode(input)
    expect(result).toMatchObject({ ok: true })
    expect(Object.keys(result).sort()).toEqual(['challengeId', 'ok'])
    expect(events.indexOf('rates')).toBeLessThan(events.indexOf('store-lookup'))
    expect(events.indexOf('persist-challenge')).toBeLessThan(
      events.indexOf('provider-probe')
    )
    expect(events[events.indexOf('provider-probe') - 1]).toBe('tx-end')
    expect(events.slice(-2)).toEqual(['send', 'sent'])
    expect(challengeWrites[0].phone).toBe('5511900000001')
    expect(challengeWrites[0]).not.toHaveProperty('code')
    expect(challengeWrites[0]).not.toHaveProperty('challengeId')
  })
  test('offline, unknown ACK, absent store and throttling reveal neither customer nor account existence', async () => {
    for (const mode of [
      'offline',
      'timeout',
      'no-ack',
      'missing-store',
      'limited',
    ]) {
      events.length = 0
      senderMode = mode
      exists = mode !== 'missing-store'
      allowed = mode !== 'limited'
      const result = await a.requestWalletCode(input)
      expect(result).toMatchObject({ ok: true })
      expect(Object.keys(result).sort()).toEqual(['challengeId', 'ok'])
      expect(events.filter(e => e === 'send').length).toBeLessThanOrEqual(1)
      expect(events).not.toContain('sent')
      if (['offline', 'timeout', 'no-ack'].includes(mode))
        expect(events).toContain('unknown')
    }
  })
  test('same-origin and secret/logging preconditions fail before touching provider/DB', async () => {
    origin = 'https://evil.example'
    expect((await a.requestWalletCode(input)).ok).toBe(false)
    expect(events).toHaveLength(0)
    origin = 'https://wallet.example'
    delete process.env.WALLET_AUTH_HMAC_KEY
    expect((await a.requestWalletCode(input)).ok).toBe(false)
    expect(events).toHaveLength(0)
    process.env.WALLET_AUTH_HMAC_KEY = fixtureWalletHmac
    process.env.DRIZZLE_DEBUG = 'true'
    expect((await a.requestWalletCode(input)).ok).toBe(false)
    expect(events).toHaveLength(0)
  })
  test('verification sets secure cookies only on success; no bearer in response', async () => {
    jar.set('__Host-wallet-browser', 'b'.repeat(64))
    const args = { ...input, challengeId: 'c'.repeat(64), code: '123456' }
    verified = false
    expect((await a.verifyWalletCode(args)).ok).toBe(false)
    expect(cookieWrites).toHaveLength(0)
    verified = true
    expect(await a.verifyWalletCode(args)).toEqual({ ok: true })
    expect(cookieWrites[0]).toMatchObject({
      name: '__Host-wallet-9',
      options: {
        secure: true,
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        maxAge: 900,
      },
    })
    expect(cookieWrites[0].value).toMatch(/^[a-f0-9]{64}$/)
  })
  test('balance requires identity before ledger read in same transaction, without module gating', async () => {
    expect(await a.getWalletBalance(input)).toEqual({
      ok: true,
      availableAmount: '12.34',
      pendingAmount: '5.67',
      productRewards: [{ id: 'reward-fixture', productName: 'X-salada', voucherCode: 'FID-fixture', expiresAt: '2026-12-03T12:00:00.000Z', state: 'available', isAvailable: true }],
    })
    expect(events.indexOf('identity')).toBeLessThan(events.indexOf('balance'))
    expect(events.indexOf('identity')).toBeLessThan(events.indexOf('rewards'))
    events.length = 0
    authenticated = false
    expect((await a.getWalletBalance(input)).ok).toBe(false)
    expect(events).not.toContain('balance')
    expect(events).not.toContain('rewards')
  })
  test('logout invalidates DB session and challenges before expiring cookie', async () => {
    jar.set('__Host-wallet-browser', 'b'.repeat(64))
    jar.set('__Host-wallet-9', 'c'.repeat(64))
    expect(await a.clearWalletSession({ storeSlug: 'fixture' })).toEqual({
      ok: true,
    })
    expect(events.filter(e => e === 'revoke')).toHaveLength(2)
    expect(cookieWrites[0]).toMatchObject({
      name: '__Host-wallet-9',
      value: '',
      options: { maxAge: 0, secure: true, httpOnly: true },
    })
  })
})
