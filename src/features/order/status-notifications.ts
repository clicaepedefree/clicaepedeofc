import type { SelectOrder } from '@/services/db/schema/orders'

export type OrderStatusNotificationStatus = SelectOrder['status'] | 'RECEIVED'
export type OrderStatusNotificationOrderType = SelectOrder['type']

export type OrderStatusNotificationTemplateContext = {
  storeName: string
  orderDisplayId: string
  orderType: OrderStatusNotificationOrderType
  status: OrderStatusNotificationStatus
  statusTitle: string
  statusMessage: string
  reason?: string | null
}

export type OrderStatusNotificationTemplateOverrides = Partial<
  Record<OrderStatusNotificationStatus, string>
>

export type OrderStatusNotificationInput = {
  storeName: string
  orderDisplayId: string
  orderType: OrderStatusNotificationOrderType
  fromStatus?: OrderStatusNotificationStatus | null
  toStatus: OrderStatusNotificationStatus
  reason?: string | null
  templateOverrides?: OrderStatusNotificationTemplateOverrides
}

export type OrderStatusNotificationResult =
  | {
      shouldNotify: true
      eventStatus: OrderStatusNotificationStatus
      title: string
      message: string
      text: string
    }
  | {
      shouldNotify: false
      reason:
        | 'unsupported_order_type'
        | 'unsupported_status'
        | 'status_not_applicable'
        | 'out_of_order'
    }

const statusRank: Record<string, number> = {
  PENDING: 10,
  CREATED: 10,
  SENT_TO_STORE: 10,
  RECEIVED: 10,
  ACCEPTED: 20,
  IN_PREPARATION: 30,
  READY: 40,
  OUT_FOR_DELIVERY: 50,
  COMPLETED: 60,
  REJECTED: 90,
  CANCELLED: 90,
}

const defaultCopy: Record<
  string,
  {
    title: string
    delivery: string
    takeout: string
  }
> = {
  RECEIVED: {
    title: 'Pedido recebido',
    delivery: 'Recebemos seu pedido e ele ja esta na fila de atendimento.',
    takeout: 'Recebemos seu pedido e ele ja esta na fila de atendimento.',
  },
  ACCEPTED: {
    title: 'Pedido confirmado',
    delivery: 'A loja confirmou o pedido e vai iniciar o preparo.',
    takeout: 'A loja confirmou o pedido e vai iniciar o preparo.',
  },
  IN_PREPARATION: {
    title: 'Pedido em preparo',
    delivery: 'Seu pedido esta sendo preparado para entrega.',
    takeout: 'Seu pedido esta sendo preparado para retirada.',
  },
  READY: {
    title: 'Pedido pronto',
    delivery: 'Seu pedido esta pronto para sair para entrega.',
    takeout: 'Seu pedido esta pronto para retirada no balcao.',
  },
  OUT_FOR_DELIVERY: {
    title: 'Saiu para entrega',
    delivery: 'Seu pedido saiu da loja e esta a caminho.',
    takeout: 'Seu pedido esta pronto para retirada no balcao.',
  },
  COMPLETED: {
    title: 'Pedido finalizado',
    delivery: 'Pedido finalizado. Obrigado por comprar com a loja.',
    takeout: 'Pedido finalizado. Obrigado por comprar com a loja.',
  },
  REJECTED: {
    title: 'Pedido nao aceito',
    delivery:
      'A loja nao conseguiu atender este pedido. Fale com a loja se precisar de ajuda.',
    takeout:
      'A loja nao conseguiu atender este pedido. Fale com a loja se precisar de ajuda.',
  },
  CANCELLED: {
    title: 'Pedido cancelado',
    delivery:
      'Este pedido foi cancelado. Se algum pagamento ja foi combinado, fale com a loja para orientacao.',
    takeout:
      'Este pedido foi cancelado. Se algum pagamento ja foi combinado, fale com a loja para orientacao.',
  },
}

const allowedTemplateTokens = new Set([
  'storeName',
  'orderDisplayId',
  'statusTitle',
  'statusMessage',
  'reason',
])

const customizableStatuses = new Set([
  'RECEIVED',
  'ACCEPTED',
  'IN_PREPARATION',
  'READY',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
])

const normalizeNotificationStatus = (
  status: OrderStatusNotificationStatus
): OrderStatusNotificationStatus =>
  ['PENDING', 'CREATED', 'SENT_TO_STORE'].includes(status) ? 'RECEIVED' : status

const isTerminalStatus = (status: OrderStatusNotificationStatus) =>
  status === 'CANCELLED' || status === 'REJECTED'

export const buildOrderStatusNotificationEventId = ({
  orderId,
  status,
}: {
  orderId: number
  status: OrderStatusNotificationStatus
}) => `order:${orderId}:status:${normalizeNotificationStatus(status)}`

const sanitizeTemplate = (template: string) => {
  const trimmed = template.replace(/\s+/g, ' ').trim().slice(0, 700)
  if (!trimmed) return null

  const invalidToken = [...trimmed.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)].some(
    match => !allowedTemplateTokens.has(match[1] ?? '')
  )
  return invalidToken ? null : trimmed
}

export const parseOrderStatusNotificationTemplateOverrides = (
  input: unknown
): OrderStatusNotificationTemplateOverrides => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}

  const rawRecord =
    'orderStatusTemplates' in input &&
    input.orderStatusTemplates &&
    typeof input.orderStatusTemplates === 'object' &&
    !Array.isArray(input.orderStatusTemplates)
      ? input.orderStatusTemplates
      : input

  return Object.entries(
    rawRecord
  ).reduce<OrderStatusNotificationTemplateOverrides>(
    (templates, [status, value]) => {
      if (!customizableStatuses.has(status) || typeof value !== 'string') {
        return templates
      }

      const sanitized = sanitizeTemplate(value)
      if (sanitized) {
        templates[status as OrderStatusNotificationStatus] = sanitized
      }

      return templates
    },
    {}
  )
}

const renderTemplate = (
  template: string,
  context: OrderStatusNotificationTemplateContext
) =>
  template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, token: string) => {
    if (!allowedTemplateTokens.has(token)) return ''
    const value = context[token as keyof OrderStatusNotificationTemplateContext]
    return typeof value === 'string' ? value : ''
  })

export function buildOrderStatusWhatsappNotification({
  storeName,
  orderDisplayId,
  orderType,
  fromStatus,
  toStatus,
  reason,
  templateOverrides,
}: OrderStatusNotificationInput): OrderStatusNotificationResult {
  if (orderType !== 'DELIVERY' && orderType !== 'TAKEOUT') {
    return { shouldNotify: false, reason: 'unsupported_order_type' }
  }

  const eventStatus = normalizeNotificationStatus(toStatus)
  if (eventStatus === 'OUT_FOR_DELIVERY' && orderType !== 'DELIVERY') {
    return { shouldNotify: false, reason: 'status_not_applicable' }
  }

  const copy = defaultCopy[eventStatus]
  if (!copy) return { shouldNotify: false, reason: 'unsupported_status' }

  const normalizedFromStatus = fromStatus
    ? normalizeNotificationStatus(fromStatus)
    : null
  if (
    normalizedFromStatus &&
    !isTerminalStatus(eventStatus) &&
    (statusRank[normalizedFromStatus] ?? 0) >= (statusRank[eventStatus] ?? 0)
  ) {
    return { shouldNotify: false, reason: 'out_of_order' }
  }

  const statusMessage = orderType === 'TAKEOUT' ? copy.takeout : copy.delivery
  const context: OrderStatusNotificationTemplateContext = {
    storeName: storeName.trim() || 'a loja',
    orderDisplayId,
    orderType,
    status: eventStatus,
    statusTitle: copy.title,
    statusMessage,
    reason: reason?.trim() || null,
  }
  const customTemplate = sanitizeTemplate(
    templateOverrides?.[eventStatus] ?? ''
  )
  const text = customTemplate
    ? renderTemplate(customTemplate, context)
    : `Atualizacao da ${context.storeName}: pedido #${context.orderDisplayId} - ${context.statusTitle}. ${context.statusMessage}`

  return {
    shouldNotify: true,
    eventStatus,
    title: copy.title,
    message: statusMessage,
    text,
  }
}
