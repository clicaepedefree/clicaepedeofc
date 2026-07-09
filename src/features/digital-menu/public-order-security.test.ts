import { describe, expect, test } from 'bun:test'
import {
  calculatePublicOrderRiskScore,
  buildPublicOrderTrackingDto,
  createPublicTrackingToken,
  hashPublicIdentifier,
  isPublicTrackingToken,
  isPublicOrderRateLimitAllowed,
  PUBLIC_ORDER_RATE_LIMIT,
  publicTrackingTokenMatches,
} from './public-order-security'

describe('calculatePublicOrderRiskScore', () => {
  test('keeps normal traffic below the challenge threshold', () => {
    expect(
      calculatePublicOrderRiskScore({
        invalidPayloads: 1,
        captchaFailures: 0,
        rateLimits: 0,
      })
    ).toBe(20)
  })

  test('combines repeated invalid attempts and captcha failures', () => {
    expect(
      calculatePublicOrderRiskScore({
        invalidPayloads: 3,
        captchaFailures: 1,
        rateLimits: 0,
      })
    ).toBe(95)
  })

  test('caps every signal to keep scoring predictable', () => {
    expect(
      calculatePublicOrderRiskScore({
        invalidPayloads: 99,
        captchaFailures: 99,
        rateLimits: 99,
      })
    ).toBe(325)
  })
})

const secret = 'test-secret-with-enough-entropy-for-hmac'

describe('public order tracking token', () => {
  test('creates a random 32-byte base64url token and stores only its HMAC', () => {
    const first = createPublicTrackingToken()
    const second = createPublicTrackingToken()
    const hash = hashPublicIdentifier(first, secret)

    expect(first !== second).toBe(true)
    expect(isPublicTrackingToken(first)).toBe(true)
    expect(Buffer.from(first, 'base64url')).toHaveLength(32)
    expect(hash).toHaveLength(64)
    expect(hash.includes(first)).toBe(false)
    expect(publicTrackingTokenMatches(first, hash, secret)).toBe(true)
    expect(publicTrackingTokenMatches(second, hash, secret)).toBe(false)
  })

  test('does not authorize malformed or missing reuse tokens', () => {
    const token = createPublicTrackingToken()
    const hash = hashPublicIdentifier(token, secret)
    expect(publicTrackingTokenMatches('not-a-token', hash, secret)).toBe(false)
    expect(publicTrackingTokenMatches(undefined, hash, secret)).toBe(false)
  })
})

describe('public order rate limit policy', () => {
  test('keeps a stricter atomic burst inside the main window', () => {
    expect(
      PUBLIC_ORDER_RATE_LIMIT.burstSeconds <
        PUBLIC_ORDER_RATE_LIMIT.windowSeconds
    ).toBe(true)
    expect(
      PUBLIC_ORDER_RATE_LIMIT.burstLimit < PUBLIC_ORDER_RATE_LIMIT.windowLimit
    ).toBe(true)
  })

  test('allows the boundary and rejects either exceeded counter', () => {
    expect(isPublicOrderRateLimitAllowed(8, 3)).toBe(true)
    expect(isPublicOrderRateLimitAllowed(9, 1)).toBe(false)
    expect(isPublicOrderRateLimitAllowed(1, 4)).toBe(false)
  })
})

describe('public tracking DTO', () => {
  const order = {
    publicOrderId: 'public-id',
    displayId: '42',
    storeName: 'Loja Teste',
    status: 'RECEIVED',
    orderType: 'DELIVERY' as const,
    total: '25.0000',
    cartSnapshot: [
      { itemName: 'Burger', quantity: 2 },
      { itemName: 'Refrigerante', quantity: 1 },
    ],
    paymentSnapshot: { label: 'Pix', status: 'PENDING', pixKey: 'must-not-leak' },
    estimatedMinutes: 35,
    submittedAt: new Date('2026-06-01T10:00:00Z'),
    updatedAt: new Date('2026-06-01T10:01:00Z'),
    trackingExpiresAt: new Date('2026-07-01T10:00:00Z'),
    customerName: 'must not leak',
    customerPhone: '5511999999999',
  }

  test('returns only the public operational fields', () => {
    const dto = buildPublicOrderTrackingDto(
      order,
      [{ status: 'RECEIVED', occurredAt: new Date('2026-06-01T10:00:05Z') }],
      new Date('2026-06-15T10:00:00Z')
    )

    expect(dto !== null).toBe(true)
    expect(Object.hasOwn(dto ?? {}, 'customerName')).toBe(false)
    expect(Object.hasOwn(dto ?? {}, 'customerPhone')).toBe(false)
    expect(Object.hasOwn(dto ?? {}, 'publicOrderId')).toBe(false)
    expect(JSON.stringify(dto).includes('must-not-leak')).toBe(false)
    expect(dto?.orderSummary).toEqual([
      { name: 'Burger', quantity: 2 },
      { name: 'Refrigerante', quantity: 1 },
    ])
    expect(dto?.payment).toEqual({ label: 'Pix', status: 'PENDING' })
    expect(dto?.timeline).toEqual([
      { status: 'RECEIVED', occurredAt: '2026-06-01T10:00:05.000Z' },
    ])
  })

  test('returns nothing after token expiry', () => {
    expect(
      buildPublicOrderTrackingDto(order, [], new Date('2026-07-01T10:00:00Z'))
    ).toBe(null)
  })
})
