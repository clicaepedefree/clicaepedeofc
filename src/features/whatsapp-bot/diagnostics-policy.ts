type DiagnosticMetadata = Record<string, unknown> | null | undefined

export type WhatsappDiagnosticSession = {
  status: string
  provider: string
  providerSessionId: string
  lastHeartbeatAt?: Date | string | null
  connectedAt?: Date | string | null
  disconnectedAt?: Date | string | null
  updatedAt?: Date | string | null
  lastErrorCode?: string | null
  lastErrorMessage?: string | null
}

export type WhatsappDiagnosticMessage = {
  id: string
  conversationId: string
  direction: 'inbound' | 'outbound' | 'internal' | string
  senderType: 'customer' | 'bot' | 'human' | 'system' | string
  messageType: string
  status: string
  body?: string | null
  metadata?: DiagnosticMetadata
  occurredAt: Date | string
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
}

export type WhatsappDiagnosticConversation = {
  id: string
  status: string
  mode: string
  contextSummary?: string | null
  humanPausedAt?: Date | string | null
  lastMessageAt?: Date | string | null
  updatedAt?: Date | string | null
  metadata?: DiagnosticMetadata
}

export type WhatsappDiagnosticTransactionalEvent = {
  id: string
  eventType: string
  status: string
  conversationId?: string | null
  orderId?: number | null
  attempts: number
  maxAttempts: number
  lastError?: string | null
  nextAttemptAt?: Date | string | null
  processedAt?: Date | string | null
  sentAt?: Date | string | null
  createdAt: Date | string
  updatedAt?: Date | string | null
}

export type WhatsappOperationalDiagnosticLog = {
  id: string
  source: 'session' | 'message' | 'conversation' | 'notification'
  label: string
  result: 'success' | 'warning' | 'failed' | 'pending'
  occurredAt: Date | string
  conversationId: string | null
  eventId: string | null
  orderId: number | null
  reason: string
}

export type WhatsappOperationalDiagnostics = {
  generatedAt: Date
  state: {
    status: string
    provider: string | null
    providerSessionId: string | null
    lastHeartbeatAt: Date | string | null
    lastErrorCode: string | null
    lastErrorMessage: string | null
  }
  lastInboundMessage: {
    id: string
    conversationId: string
    occurredAt: Date | string
    status: string
    messageType: string
    preview: string
  } | null
  lastOutboundMessage: {
    id: string
    conversationId: string
    occurredAt: Date | string
    status: string
    senderType: string
    preview: string
  } | null
  metrics: {
    aiResponses: number
    handoffs: number
    fallbacks: number
    ctas: number
    notificationsQueued: number
    notificationsSent: number
    notificationsFailed: number
    failedMessages: number
  }
  logs: WhatsappOperationalDiagnosticLog[]
}

const sensitivePatterns = [
  {
    pattern: /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,
    replacement: '[email]',
  },
  {
    pattern:
      /\b(telefone|celular|whatsapp|fone)\s*(?:e|eh|é|:|=)?\s*\+?\d[\d\s().-]{9,}\d/gi,
    replacement: '$1 [telefone]',
  },
  {
    pattern: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
    replacement: '[cpf]',
  },
  {
    pattern: /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
    replacement: '[cnpj]',
  },
  {
    pattern: /\+?\d[\d\s().-]{9,}\d/g,
    replacement: '[telefone]',
  },
  {
    pattern: /\b(?:bearer|token|api[_-]?key|secret|senha)\s*[:=]\s*\S+/gi,
    replacement: '[credencial]',
  },
  {
    pattern: /\b(?:pix|chave pix)\s*[:=]\s*\S+/gi,
    replacement: '[pix]',
  },
]

const maxPreviewLength = 96

const readRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

const readNestedRecord = (
  value: unknown,
  ...path: string[]
): Record<string, unknown> | null => {
  let current: unknown = value
  for (const key of path) {
    const record = readRecord(current)
    if (!record) return null
    current = record[key]
  }
  return readRecord(current)
}

const readNestedString = (value: unknown, ...path: string[]): string | null => {
  let current: unknown = value
  for (const key of path) {
    const record = readRecord(current)
    if (!record) return null
    current = record[key]
  }

  return typeof current === 'string' && current.trim() ? current.trim() : null
}

const readNestedBoolean = (value: unknown, ...path: string[]) => {
  let current: unknown = value
  for (const key of path) {
    const record = readRecord(current)
    if (!record) return false
    current = record[key]
  }

  return current === true
}

export const sanitizeWhatsappDiagnosticText = (
  value: string | null | undefined
) => {
  if (!value?.trim()) return 'Sem texto registrado.'

  const normalized = value.replace(/\s+/g, ' ').trim()
  const redacted = sensitivePatterns.reduce(
    (text, rule) => text.replace(rule.pattern, rule.replacement),
    normalized
  )

  return redacted.length > maxPreviewLength
    ? `${redacted.slice(0, maxPreviewLength - 1)}...`
    : redacted
}

const shortId = (value: string | null | undefined) =>
  value ? value.slice(0, 8) : null

const getMessageFallbackReason = (metadata: DiagnosticMetadata) =>
  readNestedString(metadata, 'failure', 'message') ??
  readNestedString(metadata, 'delivery', 'failure', 'message') ??
  readNestedString(metadata, 'fallbackReason') ??
  readNestedString(metadata, 'humanHandoff', 'reason') ??
  readNestedString(metadata, 'source') ??
  'Mensagem processada.'

const getConversationReason = (conversation: WhatsappDiagnosticConversation) =>
  readNestedString(conversation.metadata, 'humanHandoff', 'reasonLabel') ??
  readNestedString(conversation.metadata, 'humanHandoff', 'reason') ??
  conversation.contextSummary ??
  'Conversa atualizada.'

const getMessageResult = (
  message: WhatsappDiagnosticMessage
): WhatsappOperationalDiagnosticLog['result'] => {
  if (message.status === 'failed') return 'failed'
  if (message.status === 'skipped') return 'warning'
  if (message.status === 'queued') return 'pending'
  return 'success'
}

const getNotificationResult = (
  event: WhatsappDiagnosticTransactionalEvent
): WhatsappOperationalDiagnosticLog['result'] => {
  if (event.status === 'failed' || event.status === 'discarded') {
    return 'failed'
  }
  if (event.status === 'queued' || event.status === 'processing') {
    return 'pending'
  }
  return 'success'
}

const isAssistantMessage = (message: WhatsappDiagnosticMessage) =>
  message.direction === 'outbound' &&
  message.senderType === 'bot' &&
  readNestedString(message.metadata, 'source') ===
    'whatsapp_assistant_orchestrator'

export function buildWhatsappOperationalDiagnostics({
  session,
  messages,
  conversations,
  transactionalEvents,
  generatedAt = new Date(),
}: {
  session?: WhatsappDiagnosticSession | null
  messages: WhatsappDiagnosticMessage[]
  conversations: WhatsappDiagnosticConversation[]
  transactionalEvents: WhatsappDiagnosticTransactionalEvent[]
  generatedAt?: Date
}): WhatsappOperationalDiagnostics {
  const sortedMessages = messages
    .slice()
    .sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    )
  const lastInboundMessage =
    sortedMessages.find(message => message.direction === 'inbound') ?? null
  const lastOutboundMessage =
    sortedMessages.find(message => message.direction === 'outbound') ?? null

  const aiMessages = messages.filter(isAssistantMessage)
  const logs: WhatsappOperationalDiagnosticLog[] = []

  if (session) {
    logs.push({
      id: `session:${session.providerSessionId}`,
      source: 'session',
      label: `Sessao ${session.status}`,
      result: session.status === 'error' ? 'failed' : 'success',
      occurredAt:
        session.updatedAt ??
        session.lastHeartbeatAt ??
        session.connectedAt ??
        session.disconnectedAt ??
        generatedAt,
      conversationId: null,
      eventId: null,
      orderId: null,
      reason: sanitizeWhatsappDiagnosticText(
        session.lastErrorMessage ?? session.lastErrorCode ?? session.status
      ),
    })
  }

  for (const message of sortedMessages.slice(0, 8)) {
    logs.push({
      id: `message:${message.id}`,
      source: 'message',
      label: `${message.direction}/${message.senderType}/${message.status}`,
      result: getMessageResult(message),
      occurredAt: message.occurredAt,
      conversationId: shortId(message.conversationId),
      eventId: shortId(message.id),
      orderId: null,
      reason: sanitizeWhatsappDiagnosticText(
        message.status === 'failed'
          ? getMessageFallbackReason(message.metadata)
          : (readNestedString(message.metadata, 'intent') ??
              readNestedString(message.metadata, 'source') ??
              message.messageType)
      ),
    })
  }

  for (const conversation of conversations.slice(0, 6)) {
    logs.push({
      id: `conversation:${conversation.id}`,
      source: 'conversation',
      label: `${conversation.mode}/${conversation.status}`,
      result:
        conversation.status === 'pending_human'
          ? 'warning'
          : conversation.status === 'blocked'
            ? 'failed'
            : 'success',
      occurredAt:
        conversation.lastMessageAt ?? conversation.updatedAt ?? generatedAt,
      conversationId: shortId(conversation.id),
      eventId: null,
      orderId: null,
      reason: sanitizeWhatsappDiagnosticText(
        getConversationReason(conversation)
      ),
    })
  }

  for (const event of transactionalEvents.slice(0, 8)) {
    logs.push({
      id: `notification:${event.id}`,
      source: 'notification',
      label: `${event.eventType}/${event.status}`,
      result: getNotificationResult(event),
      occurredAt: event.updatedAt ?? event.createdAt,
      conversationId: shortId(event.conversationId ?? null),
      eventId: shortId(event.id),
      orderId: event.orderId ?? null,
      reason: sanitizeWhatsappDiagnosticText(
        event.lastError ?? `tentativas ${event.attempts}/${event.maxAttempts}`
      ),
    })
  }

  return {
    generatedAt,
    state: {
      status: session?.status ?? 'not_configured',
      provider: session?.provider ?? null,
      providerSessionId: session ? shortId(session.providerSessionId) : null,
      lastHeartbeatAt: session?.lastHeartbeatAt ?? null,
      lastErrorCode: session?.lastErrorCode ?? null,
      lastErrorMessage: session?.lastErrorMessage
        ? sanitizeWhatsappDiagnosticText(session.lastErrorMessage)
        : null,
    },
    lastInboundMessage: lastInboundMessage
      ? {
          id: shortId(lastInboundMessage.id) ?? lastInboundMessage.id,
          conversationId:
            shortId(lastInboundMessage.conversationId) ??
            lastInboundMessage.conversationId,
          occurredAt: lastInboundMessage.occurredAt,
          status: lastInboundMessage.status,
          messageType: lastInboundMessage.messageType,
          preview: sanitizeWhatsappDiagnosticText(lastInboundMessage.body),
        }
      : null,
    lastOutboundMessage: lastOutboundMessage
      ? {
          id: shortId(lastOutboundMessage.id) ?? lastOutboundMessage.id,
          conversationId:
            shortId(lastOutboundMessage.conversationId) ??
            lastOutboundMessage.conversationId,
          occurredAt: lastOutboundMessage.occurredAt,
          status: lastOutboundMessage.status,
          senderType: lastOutboundMessage.senderType,
          preview: sanitizeWhatsappDiagnosticText(lastOutboundMessage.body),
        }
      : null,
    metrics: {
      aiResponses: aiMessages.filter(
        message => !readNestedBoolean(message.metadata, 'fallback')
      ).length,
      handoffs: conversations.filter(
        conversation =>
          conversation.status === 'pending_human' ||
          readNestedRecord(conversation.metadata, 'humanHandoff')
      ).length,
      fallbacks: aiMessages.filter(message =>
        readNestedBoolean(message.metadata, 'fallback')
      ).length,
      ctas: aiMessages.filter(message =>
        readNestedBoolean(message.metadata, 'digitalMenuCta', 'sent')
      ).length,
      notificationsQueued: transactionalEvents.filter(
        event => event.status === 'queued' || event.status === 'processing'
      ).length,
      notificationsSent: transactionalEvents.filter(
        event => event.status === 'sent'
      ).length,
      notificationsFailed: transactionalEvents.filter(
        event => event.status === 'failed' || event.status === 'discarded'
      ).length,
      failedMessages: messages.filter(message => message.status === 'failed')
        .length,
    },
    logs: logs
      .sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
      )
      .slice(0, 20),
  }
}
