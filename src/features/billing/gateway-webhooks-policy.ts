import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

export const billingGatewayEventTypes = [
  'payment_succeeded',
  'payment_failed',
  'payment_refunded',
  'payment_cancelled',
  'unknown',
] as const

export type BillingGatewayEventType = (typeof billingGatewayEventTypes)[number]

export type NormalizedBillingGatewayEvent = {
  provider: string
  providerEventId: string
  eventType: BillingGatewayEventType
  invoiceId: number | null
  invoiceNumber: string | null
  providerPaymentId: string | null
  amount: string | null
  currency: string
  occurredAt: Date
  payload: Record<string, unknown>
}

export type BillingGatewaySignatureVerification =
  | { valid: true; expectedSignature: string }
  | { valid: false; reason: string; expectedSignature?: string }

const MAX_PROVIDER_LENGTH = 80
const MAX_EVENT_ID_LENGTH = 160
const SIGNATURE_TOLERANCE_SECONDS = 300

const eventTypeAliases: Record<string, BillingGatewayEventType> = {
  paid: 'payment_succeeded',
  payment_paid: 'payment_succeeded',
  payment_succeeded: 'payment_succeeded',
  payment_confirmed: 'payment_succeeded',
  charge_paid: 'payment_succeeded',
  charge_succeeded: 'payment_succeeded',
  failed: 'payment_failed',
  payment_failed: 'payment_failed',
  payment_failure: 'payment_failed',
  charge_failed: 'payment_failed',
  refunded: 'payment_refunded',
  refund: 'payment_refunded',
  payment_refunded: 'payment_refunded',
  charge_refunded: 'payment_refunded',
  cancelled: 'payment_cancelled',
  canceled: 'payment_cancelled',
  payment_cancelled: 'payment_cancelled',
  payment_canceled: 'payment_cancelled',
  charge_cancelled: 'payment_cancelled',
  charge_canceled: 'payment_cancelled',
}

const toPlainObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const pickNestedRecord = (source: Record<string, unknown>, key: string) =>
  toPlainObject(source[key])

const pickString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }

  return null
}

const pickNumber = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value !== 'string') continue

    const normalized = value.trim().replace(',', '.')
    if (!normalized) continue

    const parsed = Number(normalized)
    if (Number.isFinite(parsed)) return parsed
  }

  return null
}

const normalizeProvider = (provider: string | null | undefined) =>
  (
    provider
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '_') || 'generic_gateway'
  ).slice(0, MAX_PROVIDER_LENGTH)

const normalizeEventId = ({
  provider,
  eventId,
  payloadHash,
}: {
  provider: string
  eventId: string | null
  payloadHash: string
}) =>
  (eventId?.trim() || `${provider}:${payloadHash}`).slice(
    0,
    MAX_EVENT_ID_LENGTH
  )

const normalizeAmount = (amount: number | null) =>
  amount === null ? null : amount.toFixed(4)

const parseOccurredAt = (...values: unknown[]) => {
  const raw = pickString(...values)
  if (!raw) return new Date()

  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export function calculateBillingGatewayPayloadHash(rawBody: string) {
  return createHash('sha256').update(rawBody).digest('hex')
}

export function buildBillingGatewaySignaturePayload({
  rawBody,
  timestamp,
}: {
  rawBody: string
  timestamp: string
}) {
  return `${timestamp}.${rawBody}`
}

export function signBillingGatewayWebhookPayload({
  rawBody,
  timestamp,
  secret,
}: {
  rawBody: string
  timestamp: string
  secret: string
}) {
  return createHmac('sha256', secret)
    .update(buildBillingGatewaySignaturePayload({ rawBody, timestamp }))
    .digest('hex')
}

export function verifyBillingGatewayWebhookSignature({
  rawBody,
  timestamp,
  signature,
  secret,
  now = new Date(),
  toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
}: {
  rawBody: string
  timestamp: string | null
  signature: string | null
  secret: string | null | undefined
  now?: Date
  toleranceSeconds?: number
}): BillingGatewaySignatureVerification {
  if (!secret?.trim()) return { valid: false, reason: 'secret_not_configured' }
  if (!timestamp?.trim()) return { valid: false, reason: 'missing_timestamp' }
  if (!signature?.trim()) return { valid: false, reason: 'missing_signature' }

  const timestampDate = new Date(timestamp)
  if (Number.isNaN(timestampDate.getTime())) {
    return { valid: false, reason: 'invalid_timestamp' }
  }

  const ageInSeconds = Math.abs(now.getTime() - timestampDate.getTime()) / 1000
  if (ageInSeconds > toleranceSeconds) {
    return { valid: false, reason: 'timestamp_outside_tolerance' }
  }

  const expectedSignature = signBillingGatewayWebhookPayload({
    rawBody,
    timestamp,
    secret,
  })
  const receivedSignature = signature.replace(/^sha256=/i, '').trim()

  const expectedBuffer = Buffer.from(expectedSignature, 'hex')
  const receivedBuffer = Buffer.from(receivedSignature, 'hex')

  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return { valid: false, reason: 'signature_mismatch', expectedSignature }
  }

  return { valid: true, expectedSignature }
}

export function normalizeBillingGatewayEvent({
  rawBody,
  providerFromHeader,
}: {
  rawBody: string
  providerFromHeader?: string | null
}): NormalizedBillingGatewayEvent {
  const payload = toPlainObject(JSON.parse(rawBody))
  const data = pickNestedRecord(payload, 'data')
  const metadata = {
    ...pickNestedRecord(payload, 'metadata'),
    ...pickNestedRecord(data, 'metadata'),
  }
  const provider = normalizeProvider(
    pickString(providerFromHeader, payload.provider, data.provider)
  )
  const payloadHash = calculateBillingGatewayPayloadHash(rawBody)
  const rawType = pickString(
    payload.type,
    payload.eventType,
    payload.event_type,
    payload.status,
    data.type,
    data.eventType,
    data.event_type,
    data.status
  )
  const eventType =
    eventTypeAliases[rawType?.trim().toLowerCase() ?? ''] ?? 'unknown'

  return {
    provider,
    providerEventId: normalizeEventId({
      provider,
      eventId: pickString(
        payload.id,
        payload.eventId,
        payload.event_id,
        payload.providerEventId,
        data.id,
        data.eventId,
        data.event_id
      ),
      payloadHash,
    }),
    eventType,
    invoiceId: pickNumber(
      payload.invoiceId,
      payload.invoice_id,
      data.invoiceId,
      data.invoice_id,
      metadata.invoiceId,
      metadata.invoice_id
    ),
    invoiceNumber: pickString(
      payload.invoiceNumber,
      payload.invoice_number,
      data.invoiceNumber,
      data.invoice_number,
      metadata.invoiceNumber,
      metadata.invoice_number
    ),
    providerPaymentId: pickString(
      payload.paymentId,
      payload.payment_id,
      payload.providerPaymentId,
      data.paymentId,
      data.payment_id,
      data.providerPaymentId,
      data.provider_payment_id
    ),
    amount: normalizeAmount(
      pickNumber(
        payload.amount,
        payload.value,
        payload.paidAmount,
        payload.refundedAmount,
        data.amount,
        data.value,
        data.paidAmount,
        data.refundedAmount
      )
    ),
    currency:
      pickString(payload.currency, data.currency, metadata.currency)
        ?.toUpperCase()
        .slice(0, 12) ?? 'BRL',
    occurredAt: parseOccurredAt(
      payload.occurredAt,
      payload.occurred_at,
      payload.createdAt,
      payload.created_at,
      payload.paidAt,
      payload.failedAt,
      payload.refundedAt,
      payload.cancelledAt,
      data.occurredAt,
      data.occurred_at,
      data.createdAt,
      data.created_at,
      data.paidAt,
      data.failedAt,
      data.refundedAt,
      data.cancelledAt
    ),
    payload,
  }
}

export function resolveBillingGatewayEventProcessing({
  invoiceStatus,
  eventType,
}: {
  invoiceStatus: string
  eventType: BillingGatewayEventType
}) {
  if (eventType === 'unknown') {
    return {
      action: 'ignore' as const,
      issueType: 'unsupported_event' as const,
      reason: 'Evento do gateway nao suportado.',
    }
  }

  if (
    invoiceStatus === 'paid' &&
    (eventType === 'payment_failed' || eventType === 'payment_cancelled')
  ) {
    return {
      action: 'ignore' as const,
      issueType: 'out_of_order_event' as const,
      reason: 'Evento de falha/cancelamento chegou apos a fatura estar paga.',
    }
  }

  if (
    (invoiceStatus === 'cancelled' || invoiceStatus === 'refunded') &&
    eventType !== 'payment_refunded'
  ) {
    return {
      action: 'ignore' as const,
      issueType: 'out_of_order_event' as const,
      reason: 'Evento chegou apos a fatura estar encerrada.',
    }
  }

  return { action: 'process' as const }
}
