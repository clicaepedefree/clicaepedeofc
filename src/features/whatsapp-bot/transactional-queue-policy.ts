import { createHash } from 'node:crypto'

import type {
  SelectWhatsappBotTransactionalEvent,
  whatsappBotTransactionalEventTypes,
} from '@/services/db/schema'
import type { EvolutionApiError } from './evolution-client'

export const WHATSAPP_TRANSACTIONAL_QUEUE_LIMITS = {
  defaultLimit: 25,
  maxLimit: 100,
  defaultMaxAttempts: 4,
  maxAttempts: 8,
  retryMinutes: [1, 5, 15, 60],
} as const

export type WhatsappTransactionalQueueEventType =
  (typeof whatsappBotTransactionalEventTypes)[number]

export type WhatsappTransactionalDeliveryFailureKind =
  | 'temporary'
  | 'permanent'
  | 'disconnected'

export type WhatsappTransactionalDeliveryDecision = {
  status: 'sent' | 'failed' | 'discarded'
  attemptStatus: 'succeeded' | 'failed' | 'skipped'
  shouldRetry: boolean
  nextAttemptAt: Date | null
  errorCode: string | null
  errorMessage: string | null
}

export type WhatsappTransactionalMessagePayload = {
  text?: unknown
  [key: string]: unknown
}

export const normalizeWhatsappTransactionalQueueLimit = (
  limit: number | undefined
) =>
  Number.isFinite(limit) && Number(limit) > 0
    ? Math.min(
        Math.trunc(Number(limit)),
        WHATSAPP_TRANSACTIONAL_QUEUE_LIMITS.maxLimit
      )
    : WHATSAPP_TRANSACTIONAL_QUEUE_LIMITS.defaultLimit

export const normalizeWhatsappTransactionalMaxAttempts = (
  maxAttempts: number | undefined
) =>
  Number.isFinite(maxAttempts) && Number(maxAttempts) > 0
    ? Math.min(
        Math.trunc(Number(maxAttempts)),
        WHATSAPP_TRANSACTIONAL_QUEUE_LIMITS.maxAttempts
      )
    : WHATSAPP_TRANSACTIONAL_QUEUE_LIMITS.defaultMaxAttempts

export const normalizeWhatsappTransactionalRecipient = (value: string) => {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 14) {
    throw new Error('WHATSAPP_TRANSACTIONAL_INVALID_RECIPIENT')
  }

  return digits
}

export const buildWhatsappTransactionalIdempotencyKey = ({
  eventType,
  eventId,
  recipientPhone,
}: {
  eventType: WhatsappTransactionalQueueEventType
  eventId: string | number
  recipientPhone: string
}) => {
  const recipient = normalizeWhatsappTransactionalRecipient(recipientPhone)
  const raw = `${eventType}:${eventId}:${recipient}`
  const digest = createHash('sha256').update(raw).digest('hex').slice(0, 32)

  return `${eventType}:${digest}`
}

export const readWhatsappTransactionalTextPayload = (
  payload: WhatsappTransactionalMessagePayload
) => {
  const text = typeof payload.text === 'string' ? payload.text.trim() : ''
  if (!text) throw new Error('WHATSAPP_TRANSACTIONAL_EMPTY_TEXT')
  if (text.length > 4096)
    throw new Error('WHATSAPP_TRANSACTIONAL_TEXT_TOO_LONG')

  return text
}

export const getWhatsappTransactionalRetryDate = ({
  now,
  attempts,
}: {
  now: Date
  attempts: number
}) => {
  const index = Math.max(0, Math.min(attempts - 1, 3))
  const minutes = WHATSAPP_TRANSACTIONAL_QUEUE_LIMITS.retryMinutes[index]

  return new Date(now.getTime() + minutes * 60_000)
}

export const classifyWhatsappTransactionalFailure = (
  error: unknown
): {
  kind: WhatsappTransactionalDeliveryFailureKind
  code: string
  message: string
} => {
  const message =
    error instanceof Error ? error.message : 'Erro desconhecido no envio.'
  const maybeStatus = (error as Partial<EvolutionApiError> | null)?.status

  if (
    message.includes('WHATSAPP_TRANSACTIONAL_SESSION_DISCONNECTED') ||
    message.includes('WHATSAPP_TRANSACTIONAL_SESSION_NOT_FOUND')
  ) {
    return {
      kind: 'disconnected',
      code: 'session_disconnected',
      message,
    }
  }

  if (
    typeof maybeStatus === 'number' &&
    (maybeStatus === 408 ||
      maybeStatus === 409 ||
      maybeStatus === 429 ||
      maybeStatus >= 500)
  ) {
    return {
      kind: 'temporary',
      code: `provider_${maybeStatus}`,
      message,
    }
  }

  if (message.includes('WHATSAPP_EVOLUTION')) {
    return {
      kind: 'temporary',
      code: 'provider_error',
      message,
    }
  }

  return {
    kind: 'permanent',
    code: 'permanent_failure',
    message,
  }
}

export const resolveWhatsappTransactionalDeliveryDecision = ({
  now,
  attempts,
  maxAttempts,
  error,
}: {
  now: Date
  attempts: number
  maxAttempts: number
  error?: unknown
}): WhatsappTransactionalDeliveryDecision => {
  if (!error) {
    return {
      status: 'sent',
      attemptStatus: 'succeeded',
      shouldRetry: false,
      nextAttemptAt: null,
      errorCode: null,
      errorMessage: null,
    }
  }

  const failure = classifyWhatsappTransactionalFailure(error)
  const canRetry =
    failure.kind !== 'permanent' && attempts < Math.max(1, maxAttempts)

  if (!canRetry && failure.kind === 'permanent') {
    return {
      status: 'discarded',
      attemptStatus: 'failed',
      shouldRetry: false,
      nextAttemptAt: null,
      errorCode: failure.code,
      errorMessage: failure.message,
    }
  }

  return {
    status: 'failed',
    attemptStatus: failure.kind === 'disconnected' ? 'skipped' : 'failed',
    shouldRetry: canRetry,
    nextAttemptAt: canRetry
      ? getWhatsappTransactionalRetryDate({ now, attempts })
      : null,
    errorCode: failure.code,
    errorMessage: failure.message,
  }
}

export const isWhatsappTransactionalEventDue = ({
  event,
  now,
}: {
  event: Pick<
    SelectWhatsappBotTransactionalEvent,
    'status' | 'attempts' | 'maxAttempts' | 'nextAttemptAt'
  >
  now: Date
}) =>
  (event.status === 'queued' || event.status === 'failed') &&
  event.attempts < event.maxAttempts &&
  event.nextAttemptAt <= now
