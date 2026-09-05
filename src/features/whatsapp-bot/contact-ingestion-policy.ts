import { type whatsappBotMessageTypes } from '@/services/db/schema'

import { type whatsappBotProvider } from './session-policy'

export type WhatsappBotInboundMessageType =
  (typeof whatsappBotMessageTypes)[number]

export type WhatsappInboundMessagePayload = {
  senderPhone: string
  displayName: string | null
  providerMessageId: string | null
  body: string | null
  messageType: WhatsappBotInboundMessageType
  occurredAt: Date
  additionalDataAllowed: boolean
}

export type ContactCapturedData = {
  email?: string
  name?: string
}

const whatsappJidSuffixPattern = /@(s\.whatsapp\.net|c\.us|g\.us)$/i

const optOutPatterns = [
  /\bparar\b/i,
  /\bparem\b/i,
  /\bstop\b/i,
  /\bcancelar mensagens\b/i,
  /\bdescadastrar\b/i,
  /\bsair da lista\b/i,
  /\bremover meu contato\b/i,
  /\bnao quero (mais )?(receber )?(promocoes|promocao|ofertas|mensagens)\b/i,
  /\bn[oã]o quero (mais )?(receber )?(promo[cç][oõ]es|promo[cç][aã]o|ofertas|mensagens)\b/i,
]

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const namePattern =
  /\b(?:meu nome e|me chamo|sou)\s+([a-zA-ZÀ-ÿ][a-zA-ZÀ-ÿ\s.'-]{1,80}?)(?:\s+(?:e meu email|e meu e-mail|email|telefone)\b|$)/i

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const readString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
  }

  return null
}

const normalizeTextForMatching = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

export function normalizeWhatsappPhoneNumber(value: string) {
  const withoutSuffix = value
    .trim()
    .split(':')[0]
    ?.replace(whatsappJidSuffixPattern, '')
    .replace(/^whatsapp:/i, '')

  if (!withoutSuffix) return null

  const digits = withoutSuffix.replace(/\D/g, '')

  if (digits.length < 8 || digits.length > 15) return null

  return `+${digits}`
}

export function detectPromotionalOptOut(message?: string | null) {
  if (!message) return false

  const normalized = normalizeTextForMatching(message)
  return optOutPatterns.some(pattern => pattern.test(normalized))
}

export function extractPermittedContactData({
  message,
  displayName,
  additionalDataAllowed,
}: {
  message?: string | null
  displayName?: string | null
  additionalDataAllowed: boolean
}): ContactCapturedData | null {
  if (!additionalDataAllowed) return null

  const captured: ContactCapturedData = {}
  const email = message?.match(emailPattern)?.[0]
  const name = message?.match(namePattern)?.[1]?.trim()

  if (email) captured.email = email.toLowerCase()
  if (name) captured.name = name
  if (!captured.name && displayName) captured.name = displayName.trim()

  return Object.keys(captured).length > 0 ? captured : null
}

export function buildWhatsappGreeting({
  assistantName,
  storeName,
  displayName,
}: {
  assistantName: string
  storeName: string
  displayName?: string | null
}) {
  const normalizedName = displayName?.trim()
  const prefix = normalizedName ? `Oi, ${normalizedName}!` : 'Oi!'

  return `${prefix} Eu sou ${assistantName}, assistente virtual da ${storeName}.`
}

function readMessageType(message: Record<string, unknown>) {
  const nestedData = asRecord(message.data)
  const messageType = readString(
    message.messageType,
    message.type,
    nestedData?.messageType
  )

  if (messageType?.includes('audio')) return 'audio'
  if (messageType?.includes('image')) return 'image'
  if (messageType?.includes('document')) return 'document'

  const messageObject = asRecord(message.message)
  if (messageObject?.audioMessage) return 'audio'
  if (messageObject?.imageMessage) return 'image'
  if (messageObject?.documentMessage) return 'document'
  if (messageObject?.conversation || messageObject?.extendedTextMessage) {
    return 'text'
  }

  return messageType ? 'unknown' : 'text'
}

function readMessageBody(message: Record<string, unknown>) {
  const messageObject = asRecord(message.message)
  const extendedText = asRecord(messageObject?.extendedTextMessage)
  const imageMessage = asRecord(messageObject?.imageMessage)
  const documentMessage = asRecord(messageObject?.documentMessage)
  const text = asRecord(message.text)

  return readString(
    messageObject?.conversation,
    extendedText?.text,
    imageMessage?.caption,
    documentMessage?.caption,
    text?.message,
    message.body,
    message.messageText,
    message.text
  )
}

function readOccurredAt(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value > 9_999_999_999 ? value : value * 1000)
  }

  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value)
    const parsed = Number.isFinite(asNumber)
      ? new Date(asNumber > 9_999_999_999 ? asNumber : asNumber * 1000)
      : new Date(value)

    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  return new Date()
}

export function parseEvolutionInboundMessagePayload(
  payload: unknown
): WhatsappInboundMessagePayload | null {
  const root = asRecord(payload)
  const data = asRecord(root?.data)
  const message = data ?? root
  const key = asRecord(message?.key)

  if (!root || !message) return null

  const event = readString(root.event, message.event)?.toLowerCase()
  const hasMessageShape = Boolean(key || message.message || message.messageText)

  if (event && !event.includes('messages') && !hasMessageShape) return null
  if (key?.fromMe === true || message.fromMe === true) return null

  const senderPhone = readString(
    key?.remoteJid,
    message.remoteJid,
    message.sender,
    root.sender
  )

  if (!senderPhone) return null

  return {
    senderPhone,
    displayName: readString(
      message.pushName,
      message.notifyName,
      message.senderName,
      root.pushName
    ),
    providerMessageId: readString(key?.id, message.id, root.id),
    body: readMessageBody(message),
    messageType: readMessageType(message),
    occurredAt: readOccurredAt(
      message.messageTimestamp ?? message.timestamp ?? root.timestamp
    ),
    additionalDataAllowed:
      root.allowContactDataCapture === true ||
      data?.['allowContactDataCapture'] === true ||
      asRecord(data?.metadata)?.allowContactDataCapture === true,
  }
}

export type WhatsappContactIngestionMetadata = {
  provider: typeof whatsappBotProvider
  source: 'whatsapp_inbound'
  providerMessageId?: string
  firstMessageAt?: string
  lastMessageAt: string
  lastMessageType: WhatsappBotInboundMessageType
  displayNameSource?: 'provider'
  capturedData?: ContactCapturedData
  promotionalOptOut?: {
    requestedAt: string
    source: 'message'
  }
}

export function buildContactIngestionMetadata({
  body,
  displayName,
  providerMessageId,
  messageType,
  occurredAt,
  additionalDataAllowed,
  isFirstContact,
}: {
  body?: string | null
  displayName?: string | null
  providerMessageId?: string | null
  messageType: WhatsappBotInboundMessageType
  occurredAt: Date
  additionalDataAllowed: boolean
  isFirstContact: boolean
}): WhatsappContactIngestionMetadata {
  const capturedData = extractPermittedContactData({
    message: body,
    displayName,
    additionalDataAllowed,
  })
  const optOutRequested = detectPromotionalOptOut(body)
  const occurredAtIso = occurredAt.toISOString()

  return {
    provider: 'evolution',
    source: 'whatsapp_inbound',
    providerMessageId: providerMessageId ?? undefined,
    firstMessageAt: isFirstContact ? occurredAtIso : undefined,
    lastMessageAt: occurredAtIso,
    lastMessageType: messageType,
    displayNameSource: displayName ? 'provider' : undefined,
    capturedData: capturedData ?? undefined,
    promotionalOptOut: optOutRequested
      ? {
          requestedAt: occurredAtIso,
          source: 'message',
        }
      : undefined,
  }
}
