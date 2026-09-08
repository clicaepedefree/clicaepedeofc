import type { WhatsappAssistantIntent } from './orchestrator-policy'

export type WhatsappDigitalMenuCtaTone =
  | 'friendly'
  | 'professional'
  | 'casual'
  | 'direct'

export type WhatsappDigitalMenuAttribution = {
  source: 'whatsapp_bot'
  medium: 'assistant'
  campaign: 'digital_menu_cta'
  conversationId: string
  messageId?: string
}

export type WhatsappDigitalMenuCtaDecision = {
  shouldSend: boolean
  reason: 'new_conversation' | 'contextual_purchase_intent' | 'recently_sent'
  url: string | null
  text: string | null
  attribution: WhatsappDigitalMenuAttribution | null
}

const ctaIntents = new Set<WhatsappAssistantIntent>(['menu', 'price', 'order'])

const ctaMetadata = (metadata: unknown) =>
  metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as { digitalMenuCta?: { sent?: unknown } })
    : {}

export const buildWhatsappDigitalMenuAttributionUrl = ({
  digitalMenuUrl,
  conversationId,
  messageId,
}: {
  digitalMenuUrl: string
  conversationId: string
  messageId?: string
}) => {
  const url = new URL(digitalMenuUrl)
  url.searchParams.set('utm_source', 'whatsapp_bot')
  url.searchParams.set('utm_medium', 'assistant')
  url.searchParams.set('utm_campaign', 'digital_menu_cta')
  url.searchParams.set('wa_conversation', conversationId)
  if (messageId) url.searchParams.set('wa_message', messageId)
  return url.toString()
}

export const hasRecentDigitalMenuCta = (
  history: Array<{
    direction: string
    senderType: string
    metadata?: unknown
    body?: string | null
  }>
) => {
  const latestBotMessage = history.find(
    message => message.direction === 'outbound' && message.senderType === 'bot'
  )

  if (!latestBotMessage) return false
  return ctaMetadata(latestBotMessage.metadata).digitalMenuCta?.sent === true
}

const ctaCopyByTone: Record<WhatsappDigitalMenuCtaTone, string> = {
  friendly:
    'Se quiser, voce ja pode ver o cardapio completo e montar seu pedido por aqui:',
  professional:
    'Para consultar o cardapio completo e registrar seu pedido, acesse:',
  casual: 'Da pra ver o cardapio completo e ja montar o pedido por aqui:',
  direct: 'Acesse o cardapio completo e monte seu pedido por aqui:',
}

export const buildWhatsappDigitalMenuCtaText = ({
  tone,
  url,
}: {
  tone: WhatsappDigitalMenuCtaTone
  url: string
}) => `${ctaCopyByTone[tone] ?? ctaCopyByTone.friendly}\n${url}`

export const appendWhatsappDigitalMenuCta = ({
  reply,
  ctaText,
}: {
  reply: string
  ctaText: string
}) => {
  const trimmedReply = reply.trim()
  if (!trimmedReply) return ctaText
  if (trimmedReply.includes(ctaText)) return trimmedReply
  return `${trimmedReply}\n\n${ctaText}`
}

export const decideWhatsappDigitalMenuCta = ({
  intent,
  conversationId,
  messageId,
  digitalMenuUrl,
  tone,
  history,
}: {
  intent: WhatsappAssistantIntent
  conversationId: string
  messageId?: string
  digitalMenuUrl?: string | null
  tone: WhatsappDigitalMenuCtaTone
  history: Array<{
    direction: string
    senderType: string
    metadata?: unknown
    body?: string | null
  }>
}): WhatsappDigitalMenuCtaDecision => {
  if (!digitalMenuUrl) {
    return {
      shouldSend: false,
      reason: 'recently_sent',
      url: null,
      text: null,
      attribution: null,
    }
  }

  const recentlySent = hasRecentDigitalMenuCta(history)
  const hasPreviousBotMessage = history.some(
    message => message.direction === 'outbound' && message.senderType === 'bot'
  )
  const reason = !hasPreviousBotMessage
    ? 'new_conversation'
    : 'contextual_purchase_intent'
  const shouldSend =
    (!recentlySent && !hasPreviousBotMessage) || ctaIntents.has(intent)

  if (!shouldSend || recentlySent) {
    return {
      shouldSend: false,
      reason: 'recently_sent',
      url: null,
      text: null,
      attribution: null,
    }
  }

  const url = buildWhatsappDigitalMenuAttributionUrl({
    digitalMenuUrl,
    conversationId,
    messageId,
  })

  return {
    shouldSend: true,
    reason,
    url,
    text: buildWhatsappDigitalMenuCtaText({ tone, url }),
    attribution: {
      source: 'whatsapp_bot',
      medium: 'assistant',
      campaign: 'digital_menu_cta',
      conversationId,
      messageId,
    },
  }
}
