import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const PUBLIC_ORDER_TRACKING_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const PUBLIC_ORDER_RATE_LIMIT = {
  windowSeconds: 15 * 60,
  windowLimit: 8,
  burstSeconds: 60,
  burstLimit: 3,
} as const

export const PUBLIC_ORDER_RISK = {
  lookbackMinutes: 15,
  challengeScore: 40,
  blockScore: 100,
  temporaryBlockSeconds: 5 * 60,
} as const

export const calculatePublicOrderRiskScore = ({
  invalidPayloads,
  captchaFailures,
  rateLimits,
}: {
  invalidPayloads: number
  captchaFailures: number
  rateLimits: number
}) =>
  Math.min(invalidPayloads, 6) * 20 +
  Math.min(captchaFailures, 3) * 35 +
  Math.min(rateLimits, 2) * 50

export const isPublicOrderRateLimitAllowed = (
  windowCount: number,
  burstCount: number
) =>
  windowCount <= PUBLIC_ORDER_RATE_LIMIT.windowLimit &&
  burstCount <= PUBLIC_ORDER_RATE_LIMIT.burstLimit

const TOKEN_BYTES = 32
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export const createPublicTrackingToken = () =>
  randomBytes(TOKEN_BYTES).toString('base64url')

export const isPublicTrackingToken = (token: string) =>
  TOKEN_PATTERN.test(token)

export const hashPublicIdentifier = (value: string, secret: string) =>
  createHmac('sha256', secret).update(value).digest('hex')

export const publicTrackingTokenMatches = (
  token: string | null | undefined,
  expectedHash: string | null | undefined,
  secret: string
) => {
  if (!token || !expectedHash || !isPublicTrackingToken(token)) return false
  const actual = Buffer.from(hashPublicIdentifier(token, secret), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export type PublicOrderTrackingRow = {
  publicOrderId: string
  displayId: string
  storeName: string
  status: string
  orderType: 'DELIVERY' | 'TAKEOUT'
  total: string
  cartSnapshot: unknown
  paymentSnapshot: unknown
  estimatedMinutes: number | null
  submittedAt: Date
  updatedAt: Date
  trackingExpiresAt: Date
}

export type PublicOrderTrackingEventRow = {
  status: string
  occurredAt: Date
}

export const buildPublicOrderTrackingDto = (
  order: PublicOrderTrackingRow,
  events: PublicOrderTrackingEventRow[],
  now = new Date()
) => {
  if (order.trackingExpiresAt.getTime() <= now.getTime()) return null
  const cartItems = Array.isArray(order.cartSnapshot)
    ? order.cartSnapshot
    : []
  const payment =
    order.paymentSnapshot &&
    typeof order.paymentSnapshot === 'object' &&
    !Array.isArray(order.paymentSnapshot)
      ? (order.paymentSnapshot as Record<string, unknown>)
      : null

  return {
    displayId: order.displayId,
    storeName: order.storeName,
    status: order.status,
    orderType: order.orderType,
    total: order.total,
    payment: payment
      ? {
          label:
            typeof payment.label === 'string'
              ? payment.label
              : typeof payment.method === 'string'
                ? payment.method
                : 'Pagamento',
          status: typeof payment.status === 'string' ? payment.status : null,
        }
      : null,
    orderSummary: cartItems.slice(0, 8).flatMap(item => {
      if (!item || typeof item !== 'object') return []
      const value = item as Record<string, unknown>
      const name =
        typeof value.itemName === 'string'
          ? value.itemName
          : typeof value.name === 'string'
            ? value.name
            : null
      const quantity = Number(value.quantity ?? 1)
      if (!name) return []
      return [{ name, quantity: Number.isFinite(quantity) ? quantity : 1 }]
    }),
    estimatedMinutes: order.estimatedMinutes,
    submittedAt: order.submittedAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    expiresAt: order.trackingExpiresAt.toISOString(),
    timeline: events.map(event => ({
      status: event.status,
      occurredAt: event.occurredAt.toISOString(),
    })),
  }
}
