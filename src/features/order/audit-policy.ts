import type { SelectOrder } from '@/services/db/schema/orders'

export const orderTransitionActions = [
  'accept',
  'start_preparation',
  'mark_ready',
  'dispatch',
  'reject',
  'cancel',
  'complete',
] as const

export type OrderTransitionAction = (typeof orderTransitionActions)[number]
export type OrderStatus = SelectOrder['status']

const sensitiveAuditTextPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b(?:cpf|cnpj|telefone|celular|whatsapp|e-?mail|endere[cç]o)\b/i,
  /(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?\d{4,5}[\s.-]*\d{4}/,
  /\b\d{3}[.-]?\d{3}[.-]?\d{3}-?\d{2}\b/,
  /\b\d{2}[.]?\d{3}[.]?\d{3}[/]?\d{4}-?\d{2}\b/,
]

function normalizeAuditText(value: string, emptyMessage: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(emptyMessage)
  if (sensitiveAuditTextPatterns.some(pattern => pattern.test(normalized))) {
    throw new Error('Nao inclua telefone, CPF, CNPJ, e-mail ou endereco no historico.')
  }
  return normalized.slice(0, 1000)
}

const transitions: Record<
  OrderTransitionAction,
  { from: readonly OrderStatus[]; to: OrderStatus }
> = {
  accept: {
    from: ['PENDING', 'CREATED', 'SENT_TO_STORE', 'RECEIVED'],
    to: 'ACCEPTED',
  },
  start_preparation: {
    from: ['ACCEPTED'],
    to: 'IN_PREPARATION',
  },
  mark_ready: {
    from: ['ACCEPTED', 'IN_PREPARATION'],
    to: 'READY',
  },
  dispatch: {
    from: ['ACCEPTED', 'IN_PREPARATION', 'READY'],
    to: 'OUT_FOR_DELIVERY',
  },
  reject: {
    from: ['PENDING', 'CREATED', 'SENT_TO_STORE', 'RECEIVED'],
    to: 'REJECTED',
  },
  cancel: {
    from: [
      'PENDING',
      'CREATED',
      'SENT_TO_STORE',
      'RECEIVED',
      'ACCEPTED',
      'IN_PREPARATION',
      'READY',
      'OUT_FOR_DELIVERY',
    ],
    to: 'CANCELLED',
  },
  complete: {
    from: ['ACCEPTED', 'IN_PREPARATION', 'READY', 'OUT_FOR_DELIVERY'],
    to: 'COMPLETED',
  },
}

export function resolveOrderTransition(
  currentStatus: OrderStatus,
  action: OrderTransitionAction,
  reason?: string
) {
  const normalizedReason = reason
    ? normalizeAuditText(reason, 'Informe o motivo para rejeitar ou cancelar o pedido.')
    : null
  const transition = transitions[action]

  if (!transition.from.includes(currentStatus)) {
    throw new Error(`Transicao ${action} invalida para pedido ${currentStatus}.`)
  }

  if ((action === 'reject' || action === 'cancel') && !normalizedReason) {
    throw new Error('Informe o motivo para rejeitar ou cancelar o pedido.')
  }

  return { fromStatus: currentStatus, toStatus: transition.to, reason: normalizedReason }
}

const metadataKeys = new Set([
  'salesChannel',
  'orderType',
  'publicOrderId',
  'displayId',
])

export function sanitizeOrderAuditMetadata(
  metadata: unknown
): Record<string, string | number | boolean | null> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}

  const sanitized: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (!metadataKeys.has(key)) continue
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      sanitized[key] = typeof value === 'string' ? value.slice(0, 160) : value
    }
  }
  return sanitized
}

export function requireAuditReason(reason: string) {
  return normalizeAuditText(reason, 'Informe o motivo da anotacao.')
}

type AuditEventForDto = {
  id: number
  eventType: string
  fromStatus: string | null
  toStatus: string | null
  actorType: string | null
  actorUserId: string | null
  origin: string
  reason: string | null
  requestId: string
  metadata: unknown
  createdAt: Date
}

export function toOrderAuditEventDto(event: AuditEventForDto) {
  return {
    id: event.id,
    eventType: event.eventType,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    actorType: event.actorType,
    origin: event.origin,
    reason: event.reason,
    metadata: sanitizeOrderAuditMetadata(event.metadata),
    createdAt: event.createdAt,
  }
}
