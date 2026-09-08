import type { WhatsappAssistantIntent } from './orchestrator-policy'

export type WhatsappHumanHandoffReason =
  | 'explicit_human_request'
  | 'customer_complaint'
  | 'cancellation_request'
  | 'payment_attention'
  | 'low_confidence'

export type WhatsappHumanHandoffDecision = {
  shouldHandoff: boolean
  reason: WhatsappHumanHandoffReason | null
  confidence: 'high' | 'medium' | 'low'
}

type HandoffHistoryMessage = {
  direction: string
  senderType: string
  body?: string | null
  metadata?: unknown
}

const complaintPatterns = [
  /reclama[cç][aã]o/i,
  /problema/i,
  /insatisfeit/i,
  /errad[oa]/i,
  /nao chegou/i,
  /n[aã]o chegou/i,
  /demorou/i,
  /atrasad[oa]/i,
  /frio/i,
]

const cancellationPatterns = [
  /cancelar/i,
  /cancela/i,
  /desist/i,
  /nao quero mais/i,
  /n[aã]o quero mais/i,
]

const paymentAttentionPatterns = [
  /comprovante/i,
  /ja paguei/i,
  /j[aá] paguei/i,
  /paguei.*(pix|pedido|agora)/i,
  /(problema|erro|falha|recusou|negou).*(pagamento|pix|cart[aã]o)/i,
  /(pagamento|pix|cart[aã]o).*(problema|erro|falha|recusou|negou)/i,
  /estorno/i,
  /reembolso/i,
  /cobran[cç]a/i,
  /cobrou/i,
]

const metadataRecord = (metadata: unknown) =>
  metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {}

const hasRecentFallback = (history: HandoffHistoryMessage[]) => {
  const latestBotMessage = history.find(
    message => message.direction === 'outbound' && message.senderType === 'bot'
  )
  return metadataRecord(latestBotMessage?.metadata).fallback === true
}

const matchesAny = (message: string, patterns: RegExp[]) =>
  patterns.some(pattern => pattern.test(message))

export const detectWhatsappHumanHandoff = ({
  intent,
  message,
  history,
  providerFailed = false,
}: {
  intent: WhatsappAssistantIntent
  message?: string | null
  history?: HandoffHistoryMessage[]
  providerFailed?: boolean
}): WhatsappHumanHandoffDecision => {
  const normalizedMessage = message?.trim() ?? ''

  if (intent === 'human_support') {
    return {
      shouldHandoff: true,
      reason: 'explicit_human_request',
      confidence: 'high',
    }
  }

  if (matchesAny(normalizedMessage, cancellationPatterns)) {
    return {
      shouldHandoff: true,
      reason: 'cancellation_request',
      confidence: 'high',
    }
  }

  if (matchesAny(normalizedMessage, complaintPatterns)) {
    return {
      shouldHandoff: true,
      reason: 'customer_complaint',
      confidence: 'high',
    }
  }

  if (matchesAny(normalizedMessage, paymentAttentionPatterns)) {
    return {
      shouldHandoff: true,
      reason: 'payment_attention',
      confidence: 'medium',
    }
  }

  if (
    intent === 'unknown' &&
    (providerFailed || hasRecentFallback(history ?? []))
  ) {
    return {
      shouldHandoff: true,
      reason: 'low_confidence',
      confidence: 'low',
    }
  }

  return { shouldHandoff: false, reason: null, confidence: 'high' }
}

export const getWhatsappHumanHandoffReasonLabel = (
  reason: WhatsappHumanHandoffReason | string | null | undefined
) => {
  switch (reason) {
    case 'explicit_human_request':
      return 'Pedido de atendente'
    case 'customer_complaint':
      return 'Reclamacao'
    case 'cancellation_request':
      return 'Cancelamento'
    case 'payment_attention':
      return 'Pagamento'
    case 'low_confidence':
      return 'Baixa confianca'
    default:
      return 'Atendimento humano'
  }
}

export const buildWhatsappHumanHandoffContextSummary = ({
  reason,
  intent,
  currentMessage,
}: {
  reason: WhatsappHumanHandoffReason
  intent: WhatsappAssistantIntent
  currentMessage?: string | null
}) => {
  const label = getWhatsappHumanHandoffReasonLabel(reason)
  const message = currentMessage?.trim()

  return [
    `Encaminhado para humano: ${label}.`,
    `Ultima intencao: ${intent}.`,
    message ? `Mensagem do cliente: ${message.slice(0, 180)}.` : null,
  ]
    .filter(Boolean)
    .join(' ')
}

export const buildWhatsappHumanHandoffInternalNote = ({
  reason,
  contactName,
  currentMessage,
}: {
  reason: WhatsappHumanHandoffReason
  contactName?: string | null
  currentMessage?: string | null
}) => {
  const label = getWhatsappHumanHandoffReasonLabel(reason)
  const name = contactName?.trim() || 'Cliente'
  const message = currentMessage?.trim()

  return [
    `${name} precisa de atendimento humano.`,
    `Motivo: ${label}.`,
    message ? `Ultima mensagem: ${message.slice(0, 220)}` : null,
  ]
    .filter(Boolean)
    .join(' ')
}
