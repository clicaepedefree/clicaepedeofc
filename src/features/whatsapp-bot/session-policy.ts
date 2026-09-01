import crypto from 'crypto'

import { getPublicAppBaseUrl } from '@/shared/lib/domain-config'

export const whatsappBotProvider = 'evolution' as const

export type WhatsappBotSessionStatus =
  | 'disconnected'
  | 'pending_qr'
  | 'connecting'
  | 'connected'
  | 'paused'
  | 'error'

export const protectedWhatsappBotSessionStatuses = [
  'paused',
  'disconnected',
] as const satisfies readonly WhatsappBotSessionStatus[]

export type EvolutionConnectionState = 'open' | 'connecting' | 'close'

export type EvolutionSessionDecision = {
  status: WhatsappBotSessionStatus
  numberStatus: 'active' | 'inactive' | 'disconnected' | 'error'
  action: 'none' | 'request_new_qr' | 'schedule_reconnect'
  errorCode: string | null
  errorMessage: string | null
}

const temporaryCloseMarkers = [
  'connection_lost',
  'connection closed',
  'timed out',
  'timeout',
  'restart',
  'unavailable',
]

const invalidSessionMarkers = [
  'logged_out',
  'loggedout',
  'logout',
  'invalid',
  'unauthorized',
  'forbidden',
  '401',
  '403',
]

function normalizeReason(reason: unknown) {
  if (typeof reason !== 'string' && typeof reason !== 'number') return ''
  return String(reason).trim().toLowerCase()
}

export function buildEvolutionInstanceName({
  storeId,
  numberId,
}: {
  storeId: number
  numberId: number
}) {
  return `clica-store-${storeId}-wa-${numberId}`
}

export function buildEvolutionWebhookUrl() {
  return `${getPublicAppBaseUrl()}/api/webhooks/whatsapp/evolution`
}

export function buildWhatsappSessionNonce() {
  return crypto.randomUUID()
}

export function resolveQrCodeExpiresAt({
  now = new Date(),
  ttlSeconds = 45,
}: {
  now?: Date
  ttlSeconds?: number
} = {}) {
  return new Date(now.getTime() + Math.max(15, ttlSeconds) * 1000)
}

export function resolveReconnectPlan({
  now = new Date(),
  lastAttemptAt,
  attemptCount = 0,
  maxAttempts = 5,
}: {
  now?: Date
  lastAttemptAt?: Date | null
  attemptCount?: number
  maxAttempts?: number
}) {
  if (attemptCount >= maxAttempts) {
    return {
      shouldAttempt: false,
      nextAttemptCount: attemptCount,
      reason: 'max_attempts_reached',
    } as const
  }

  const cooldownMinutes = Math.min(15, Math.max(1, attemptCount + 1))
  const nextAllowedAt = lastAttemptAt
    ? new Date(lastAttemptAt.getTime() + cooldownMinutes * 60_000)
    : now

  if (nextAllowedAt > now) {
    return {
      shouldAttempt: false,
      nextAttemptCount: attemptCount,
      reason: 'cooldown_active',
    } as const
  }

  return {
    shouldAttempt: true,
    nextAttemptCount: attemptCount + 1,
    reason: 'attempt_allowed',
  } as const
}

export function shouldApplyEvolutionSessionEvent({
  currentStatus,
  hasQrCode,
  nextStatus,
}: {
  currentStatus: WhatsappBotSessionStatus
  hasQrCode: boolean
  nextStatus: WhatsappBotSessionStatus
}) {
  if (
    protectedWhatsappBotSessionStatuses.includes(
      currentStatus as (typeof protectedWhatsappBotSessionStatuses)[number]
    )
  ) {
    return false
  }

  if (
    currentStatus === 'connected' &&
    hasQrCode &&
    nextStatus === 'pending_qr'
  ) {
    return false
  }

  return true
}

export function normalizeEvolutionConnectionDecision({
  state,
  reason,
  hasQrCode = false,
}: {
  state: string | null | undefined
  reason?: unknown
  hasQrCode?: boolean
}): EvolutionSessionDecision {
  const normalizedState = String(state ?? '').toLowerCase()
  const normalizedReason = normalizeReason(reason)

  if (!normalizedState && hasQrCode) {
    return {
      status: 'pending_qr',
      numberStatus: 'inactive',
      action: 'none',
      errorCode: null,
      errorMessage: null,
    }
  }

  if (normalizedState === 'open') {
    return {
      status: 'connected',
      numberStatus: 'active',
      action: 'none',
      errorCode: null,
      errorMessage: null,
    }
  }

  if (normalizedState === 'connecting') {
    return {
      status: 'pending_qr',
      numberStatus: 'inactive',
      action: 'none',
      errorCode: null,
      errorMessage: null,
    }
  }

  if (normalizedState === 'close') {
    if (
      invalidSessionMarkers.some(marker => normalizedReason.includes(marker))
    ) {
      return {
        status: 'pending_qr',
        numberStatus: 'disconnected',
        action: 'request_new_qr',
        errorCode: 'session_invalid',
        errorMessage:
          'Sessao do WhatsApp invalida. A loja precisa ler um novo QR Code.',
      }
    }

    if (
      temporaryCloseMarkers.some(marker => normalizedReason.includes(marker))
    ) {
      return {
        status: 'connecting',
        numberStatus: 'disconnected',
        action: 'schedule_reconnect',
        errorCode: 'temporary_disconnect',
        errorMessage:
          'Conexao temporariamente indisponivel. Reconexao automatica iniciada.',
      }
    }

    return {
      status: 'disconnected',
      numberStatus: 'disconnected',
      action: 'none',
      errorCode: null,
      errorMessage: null,
    }
  }

  return {
    status: 'error',
    numberStatus: 'error',
    action: 'none',
    errorCode: 'unknown_state',
    errorMessage: `Estado de conexao desconhecido: ${state ?? 'vazio'}.`,
  }
}

export function assertWhatsappWebhookAuthorized({
  authorizationHeader,
  explicitSecretHeader,
  expectedSecret,
}: {
  authorizationHeader: string | null
  explicitSecretHeader: string | null
  expectedSecret: string | undefined
}) {
  if (!expectedSecret) return false

  const bearerToken = authorizationHeader?.replace(/^Bearer\s+/i, '').trim()
  return (
    bearerToken === expectedSecret || explicitSecretHeader === expectedSecret
  )
}
