import type {
  SelectWhatsappBotAssistantConfig,
  SelectWhatsappBotSession,
} from '@/services/db/schema'

export const whatsappBotRolloutModes = ['off', 'pilot', 'all'] as const

export type WhatsappBotRolloutMode = (typeof whatsappBotRolloutModes)[number]

export type WhatsappBotRolloutConfig = {
  mode: WhatsappBotRolloutMode
  pilotStoreIds: ReadonlySet<number>
}

export type WhatsappBotRolloutEnv = {
  WHATSAPP_BOT_ROLLOUT_MODE?: string
  WHATSAPP_BOT_PILOT_STORE_IDS?: string
}

export type WhatsappBotRolloutDecision =
  | { allowed: true; reason: null }
  | {
      allowed: false
      reason:
        | 'rollout_off'
        | 'store_not_in_pilot'
        | 'session_not_connected'
        | 'assistant_not_active'
    }

export type WhatsappBotStoreRolloutDecision =
  | { allowed: true; reason: null }
  | {
      allowed: false
      reason: 'rollout_off' | 'store_not_in_pilot'
    }

const splitList = (value?: string) =>
  value
    ?.split(',')
    .map(item => item.trim())
    .filter(Boolean) ?? []

export function parseWhatsappBotRolloutMode(
  value?: string | null
): WhatsappBotRolloutMode {
  const normalized = value?.trim().toLowerCase()

  return whatsappBotRolloutModes.includes(
    normalized as WhatsappBotRolloutMode
  )
    ? (normalized as WhatsappBotRolloutMode)
    : 'all'
}

export function parseWhatsappBotPilotStoreIds(value?: string | null) {
  return new Set(
    splitList(value ?? undefined)
      .map(item => Number(item))
      .filter(item => Number.isInteger(item) && item > 0)
  )
}

export function resolveWhatsappBotRolloutConfig(
  env?: WhatsappBotRolloutEnv
): WhatsappBotRolloutConfig {
  const source = env ?? (process.env as Record<string, string | undefined>)

  return {
    mode: parseWhatsappBotRolloutMode(source.WHATSAPP_BOT_ROLLOUT_MODE),
    pilotStoreIds: parseWhatsappBotPilotStoreIds(
      source.WHATSAPP_BOT_PILOT_STORE_IDS
    ),
  }
}

export function canStoreReceiveWhatsappBotReplies({
  storeId,
  session,
  assistantConfig,
  rolloutConfig = resolveWhatsappBotRolloutConfig(),
}: {
  storeId: number
  session: Pick<SelectWhatsappBotSession, 'status'>
  assistantConfig: Pick<
    SelectWhatsappBotAssistantConfig,
    'status' | 'testModeEnabled'
  >
  rolloutConfig?: WhatsappBotRolloutConfig
}): WhatsappBotRolloutDecision {
  if (rolloutConfig.mode === 'off') {
    return { allowed: false, reason: 'rollout_off' }
  }

  if (
    rolloutConfig.mode === 'pilot' &&
    !rolloutConfig.pilotStoreIds.has(storeId)
  ) {
    return { allowed: false, reason: 'store_not_in_pilot' }
  }

  if (session.status !== 'connected') {
    return { allowed: false, reason: 'session_not_connected' }
  }

  if (assistantConfig.status !== 'active' || assistantConfig.testModeEnabled) {
    return { allowed: false, reason: 'assistant_not_active' }
  }

  return { allowed: true, reason: null }
}

export function canStoreUseWhatsappBotRollout({
  storeId,
  rolloutConfig = resolveWhatsappBotRolloutConfig(),
}: {
  storeId: number
  rolloutConfig?: WhatsappBotRolloutConfig
}): WhatsappBotStoreRolloutDecision {
  if (rolloutConfig.mode === 'off') {
    return { allowed: false, reason: 'rollout_off' }
  }

  if (
    rolloutConfig.mode === 'pilot' &&
    !rolloutConfig.pilotStoreIds.has(storeId)
  ) {
    return { allowed: false, reason: 'store_not_in_pilot' }
  }

  return { allowed: true, reason: null }
}
