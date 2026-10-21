import type { WhatsappAssistantStoreToolsResult } from './store-tools-policy'

export const whatsappAssistantOutputFallback =
  'Nao consegui confirmar essa informacao com seguranca. Uma pessoa da equipe pode ajudar.'

const neutralReplies = [
  'Ola! Como posso ajudar?',
  'Ol\u00e1! Como posso ajudar?',
  'Como posso ajudar?',
  'Posso ajudar com o cardapio?',
  'Posso ajudar com o card\u00e1pio?',
  'Confira as informacoes do cardapio.',
  'Confira as informa\u00e7\u00f5es do card\u00e1pio.',
] as const

export type WhatsappAssistantOutputReason =
  | 'verified_catalog_response'
  | 'verified_store_response'
  | 'neutral_response'
  | 'empty_output'
  | 'output_too_long'
  | 'internal_content'
  | 'unsupported_response'

export type WhatsappAssistantOutputDecision = {
  allowed: boolean
  text: string
  reason: WhatsappAssistantOutputReason
}

function catalogMoney(value: string): string | null {
  // Do not round or parse floating point: DB numeric prices have four decimals.
  const match = /^(0|[1-9]\d{0,8})(?:\.(\d{1,4}))?$/.exec(value)
  if (!match || /[1-9]/.test((match[2] ?? '').slice(2))) return null
  return `${match[1]},${(match[2] ?? '').padEnd(2, '0').slice(0, 2)}`
}

/**
 * Public render grammar, not a semantic classifier. Only the server-loaded,
 * conversation-scoped snapshot may supply facts; never provider toolCalls,
 * user text, history, descriptions or provider-supplied "verified" metadata.
 * Unsupported prose fails closed, even if individual values appear in source.
 */
export function buildWhatsappAssistantVerifiedCatalogReplies(
  storeTools?: WhatsappAssistantStoreToolsResult | null
): string[] {
  if (
    storeTools?.scope !== 'conversation_store' ||
    storeTools.menu.status !== 'known'
  ) {
    return []
  }

  return storeTools.menu.products.flatMap(product => {
    if (
      product.availabilityStatus !== 'available' ||
      (product.inventory !== null && product.inventory <= 0) ||
      product.unavailableReason !== null ||
      !/^[\p{L}\p{N} .,'()/-]{1,120}$/u.test(product.name) ||
      product.name !== product.name.trim()
    ) {
      return []
    }
    const price = catalogMoney(product.price)
    if (price === null) return []
    return [
      `${product.name} - R$ ${price}`,
      `${product.name} custa R$ ${price}.`,
    ]
  })
}

const weekdays = [
  'domingo',
  'segunda-feira',
  'terca-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sabado',
] as const

const paymentLabels: Record<
  WhatsappAssistantStoreToolsResult['payments'][number]['method'],
  string
> = {
  CASH: 'dinheiro',
  PIX: 'PIX',
  CREDIT: 'cartao de credito',
  DEBIT: 'cartao de debito',
  MEAL_VOUCHER: 'vale-refeicao',
  FOOD_VOUCHER: 'vale-alimentacao',
  ONLINE: 'pagamento online',
}

function hourTime(value: string): string | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/.exec(value)
  return match ? `${match[1]}:${match[2]}` : null
}

function verifiedStoreReplies(
  storeTools?: WhatsappAssistantStoreToolsResult | null
): string[] {
  if (storeTools?.scope !== 'conversation_store') {
    return ['Nao tenho dados verificados da loja neste atendimento.']
  }
  const { operations, payments } = storeTools
  const replies: string[] = []
  const menu = operations.digitalMenu
  const validOperation =
    menu &&
    ['OPEN', 'CLOSED', 'PAUSED', 'TAKEOUT_ONLY', 'DELIVERY_ONLY'].includes(
      menu.operationalStatus
    ) &&
    ['DRAFT', 'PUBLISHED', 'PAUSED'].includes(menu.publicationStatus)
  const enabled =
    validOperation &&
    menu.isDigitalMenuEnabled &&
    menu.isAcceptingOrders &&
    menu.publicationStatus === 'PUBLISHED' &&
    !['CLOSED', 'PAUSED'].includes(menu.operationalStatus)

  for (const [type, label] of [
    ['DELIVERY', 'entrega'],
    ['TAKEOUT', 'retirada'],
  ] as const) {
    const hours = operations.businessHours.flatMap(hour => {
      if (
        !hour.isActive ||
        !Number.isInteger(hour.weekday) ||
        hour.weekday < 0 ||
        hour.weekday > 6 ||
        (hour.serviceType !== type && hour.serviceType !== 'ALL')
      )
        return []
      const opens = hourTime(hour.opensAt)
      const closes = hourTime(hour.closesAt)
      // Equal bounds do not establish whether a shop is closed or open 24h.
      if (!opens || !closes || opens === closes) return []
      return [
        `Horario de ${label} cadastrado: ${weekdays[hour.weekday]}, das ${opens} as ${closes}${closes < opens ? ' do dia seguinte' : ''}.`,
      ]
    })
    replies.push(
      ...(hours.length
        ? hours
        : [`Horarios de ${label} nao informados no cadastro.`])
    )

    const methods = payments.flatMap(payment => {
      if (!(type === 'DELIVERY' ? payment.allowDelivery : payment.allowTakeout))
        return []
      // Never render brand, instructions, proofInstructions or pixKey as facts.
      const labelValue = Object.hasOwn(paymentLabels, payment.method)
        ? paymentLabels[payment.method]
        : null
      return labelValue
        ? [`Pagamento cadastrado para ${label}: ${labelValue}.`]
        : []
    })
    replies.push(
      ...(methods.length
        ? methods
        : [`Formas de pagamento para ${label} nao informadas no cadastro.`])
    )
  }

  if (!validOperation) {
    replies.push(
      'Disponibilidade das modalidades nao configurada neste atendimento.'
    )
  } else {
    const delivery = Boolean(
      enabled &&
        menu.operationalStatus !== 'TAKEOUT_ONLY' &&
        operations.modalities.delivery
    )
    const takeout = Boolean(
      enabled &&
        menu.operationalStatus !== 'DELIVERY_ONLY' &&
        operations.modalities.takeout
    )
    for (const [label, available] of [
      ['Entrega', delivery],
      ['Retirada', takeout],
      ['Agendamento', Boolean(enabled && operations.modalities.scheduled)],
    ] as const) {
      replies.push(
        `${label} ${available ? 'habilitada' : 'desabilitada'} na configuracao do cardapio.`
      )
    }
  }

  if (menu) {
    const minimum = catalogMoney(menu.minimumOrderAmount)
    if (minimum !== null) replies.push(`Pedido minimo: R$ ${minimum}.`)
    if (
      Number.isInteger(menu.averagePreparationMinutes) &&
      menu.averagePreparationMinutes > 0
    ) {
      replies.push(
        `Tempo medio de preparo cadastrado: ${menu.averagePreparationMinutes} minutos.`
      )
    }
  }
  // The typed snapshot contains no delivery-zone/address fee. Minimum order
  // is NOT freight, and arbitrary added properties must not become authority.
  replies.push('Taxa de entrega nao informada neste atendimento.')
  return replies
}

/** Exact public reply lines for prompt selection AND enforcement, from one snapshot. */
export function buildWhatsappAssistantApprovedReplyCandidates(
  storeTools?: WhatsappAssistantStoreToolsResult | null
): string[] {
  return [
    ...new Set([
      ...neutralReplies,
      whatsappAssistantOutputFallback,
      ...buildWhatsappAssistantVerifiedCatalogReplies(storeTools),
      ...verifiedStoreReplies(storeTools),
    ]),
  ]
}

export function guardWhatsappAssistantOutput({
  text,
  storeTools,
  systemPrompt,
}: {
  text: string
  storeTools?: WhatsappAssistantStoreToolsResult | null
  systemPrompt?: string
}): WhatsappAssistantOutputDecision {
  const reject = (reason: WhatsappAssistantOutputReason) => ({
    allowed: false,
    text: whatsappAssistantOutputFallback,
    reason,
  })
  const candidate = text.trim()
  if (!candidate) return reject('empty_output')
  if (candidate.length > 4_000) return reject('output_too_long')

  const catalog = new Set(
    buildWhatsappAssistantVerifiedCatalogReplies(storeTools)
  )
  const approved = new Set(
    buildWhatsappAssistantApprovedReplyCandidates(storeTools)
  )
  const lines = candidate.split(/\r?\n/).filter(line => line.trim())
  // Accept entire statements, never a price/name appearing somewhere in prose.
  if (lines.every(line => approved.has(line))) {
    return {
      allowed: true,
      text: candidate,
      reason: lines.every(line => catalog.has(line))
        ? 'verified_catalog_response'
        : neutralReplies.some(reply => reply === candidate) ||
            candidate === whatsappAssistantOutputFallback
          ? 'neutral_response'
          : 'verified_store_response',
    }
  }

  // These checks only improve the trace reason. The closed grammar above is
  // the enforcement boundary, including unknown/obfuscated sentinel strings.
  const echoesPrompt = systemPrompt
    ?.split(/\r?\n/)
    .some(line => line.trim().length >= 24 && candidate.includes(line.trim()))
  if (
    echoesPrompt ||
    /prompt|sentinel|<\/?(?:system|customer_name|historico|mensagem_cliente)>|ferramentas internas/i.test(
      candidate
    )
  ) {
    return reject('internal_content')
  }
  return reject('unsupported_response')
}
