import type { WhatsappTransactionalQueueEventType } from './transactional-queue-policy'

export const WHATSAPP_BOT_RETENTION_POLICY = {
  openConversationDays: 90,
  closedConversationDays: 30,
  transactionalEventDays: 180,
  deliveryAttemptDays: 180,
  inactiveContactDays: 365,
  expiredQrCodeMinutes: 15,
} as const

export type WhatsappNotificationCategory = 'transactional' | 'promotional'

const promotionalEventTypes = new Set<WhatsappTransactionalQueueEventType>([
  'manual',
])

const sensitiveMetadataKeyPattern =
  /(token|secret|password|authorization|apikey|api_key|qrcode|qr_code|base64|payload|raw)/i

export function classifyWhatsappNotificationCategory({
  eventType,
  payload,
}: {
  eventType: WhatsappTransactionalQueueEventType
  payload?: Record<string, unknown> | null
}): WhatsappNotificationCategory {
  if (payload?.notificationCategory === 'transactional') return 'transactional'
  if (payload?.notificationCategory === 'promotional') return 'promotional'
  if (payload?.promotional === true) return 'promotional'

  return promotionalEventTypes.has(eventType) ? 'promotional' : 'transactional'
}

export function canSendWhatsappNotificationToContact({
  category,
  promotionalOptOutAt,
}: {
  category: WhatsappNotificationCategory
  promotionalOptOutAt?: Date | string | null
}) {
  return category === 'transactional' || !promotionalOptOutAt
}

export function redactWhatsappSensitiveMetadata<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => redactWhatsappSensitiveMetadata(item)) as T
  }

  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      sensitiveMetadataKeyPattern.test(key)
        ? '[redacted]'
        : redactWhatsappSensitiveMetadata(entry),
    ])
  ) as T
}

export function maskWhatsappAuditPhone(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, '') ?? ''
  if (!digits) return 'sem_numero'

  return `***${digits.slice(-4)}`
}

export function getWhatsappRetentionCutoffs(now = new Date()) {
  const subtract = (amount: number, unit: 'days' | 'minutes') => {
    const multiplier = unit === 'days' ? 24 * 60 * 60_000 : 60_000
    return new Date(now.getTime() - amount * multiplier)
  }

  return {
    openConversationBefore: subtract(
      WHATSAPP_BOT_RETENTION_POLICY.openConversationDays,
      'days'
    ),
    closedConversationBefore: subtract(
      WHATSAPP_BOT_RETENTION_POLICY.closedConversationDays,
      'days'
    ),
    transactionalEventBefore: subtract(
      WHATSAPP_BOT_RETENTION_POLICY.transactionalEventDays,
      'days'
    ),
    deliveryAttemptBefore: subtract(
      WHATSAPP_BOT_RETENTION_POLICY.deliveryAttemptDays,
      'days'
    ),
    inactiveContactBefore: subtract(
      WHATSAPP_BOT_RETENTION_POLICY.inactiveContactDays,
      'days'
    ),
    expiredQrCodeBefore: subtract(
      WHATSAPP_BOT_RETENTION_POLICY.expiredQrCodeMinutes,
      'minutes'
    ),
  }
}

export const whatsappBotLgpdRetentionSummary = [
  'Credenciais do provedor sao armazenadas somente cifradas no backend.',
  'QR Code fica disponivel apenas enquanto esta valido e e removido apos expiracao, pausa ou desconexao.',
  'Mensagens e conversas antigas sao removidas por janela de retencao operacional.',
  'Contatos inativos podem ser removidos quando nao possuem fila, conversa recente ou opt-out pendente.',
  'Opt-out bloqueia notificacoes promocionais, mas nao bloqueia mensagens transacionais de pedido.',
] as const
