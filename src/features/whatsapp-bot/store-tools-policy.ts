import type {
  SelectStoreBusinessHour,
  SelectStoreDigitalMenuSettings,
  SelectStorePaymentMethod,
} from '@/services/db/schema'
import type { WhatsappAssistantLlmTool } from './llm-provider'

export type WhatsappAssistantStoreToolOption = {
  id: number
  name: string
  price: string
  minQuantity: number
  maxQuantity: number
}

export type WhatsappAssistantStoreToolOptionGroup = {
  id: number
  name: string
  minQuantity: number
  maxQuantity: number
  options: WhatsappAssistantStoreToolOption[]
}

export type WhatsappAssistantStoreToolProduct = {
  itemOfferingId: number
  itemId: number
  categoryName: string
  name: string
  description: string | null
  price: string
  originalPrice: string | null
  inventory: number | null
  externalCode: string | null
  availabilityStatus: 'available' | 'unavailable'
  unavailableReason: string | null
  optionGroups: WhatsappAssistantStoreToolOptionGroup[]
}

export type WhatsappAssistantStoreToolsResult = {
  scope: 'conversation_store'
  store: {
    name: string
    subdomain: string
    digitalMenuUrl: string
  }
  menu: {
    status: 'known' | 'missing'
    products: WhatsappAssistantStoreToolProduct[]
    unavailableProducts: WhatsappAssistantStoreToolProduct[]
    emptyReason: string | null
  }
  operations: {
    digitalMenu: Pick<
      SelectStoreDigitalMenuSettings,
      | 'isDigitalMenuEnabled'
      | 'isAcceptingOrders'
      | 'publicationStatus'
      | 'operationalStatus'
      | 'operationalStatusMessage'
      | 'minimumOrderAmount'
      | 'averagePreparationMinutes'
    > | null
    businessHours: Pick<
      SelectStoreBusinessHour,
      'weekday' | 'opensAt' | 'closesAt' | 'serviceType' | 'isActive'
    >[]
    modalities: {
      delivery: boolean
      takeout: boolean
      scheduled: boolean
    }
  }
  payments: Pick<
    SelectStorePaymentMethod,
    | 'method'
    | 'cardBrand'
    | 'instructions'
    | 'proofInstructions'
    | 'pixKey'
    | 'allowDelivery'
    | 'allowTakeout'
  >[]
}

export const whatsappAssistantStoreToolDefinitions = [
  {
    name: 'search_menu_items',
    description:
      'Busca produtos, descricoes, precos, disponibilidade, adicionais, tamanhos e variacoes da loja vinculada a conversa.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        query: { type: 'string' },
        categoryName: { type: 'string' },
        includeUnavailable: { type: 'boolean' },
      },
    },
  },
  {
    name: 'get_store_hours',
    description:
      'Consulta dias e horarios de funcionamento da loja vinculada a conversa.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        serviceType: { enum: ['DELIVERY', 'TAKEOUT', 'ALL'] },
      },
    },
  },
  {
    name: 'get_store_payments_and_modalities',
    description:
      'Consulta formas de pagamento e modalidades de atendimento configuradas para a loja vinculada a conversa.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        orderType: { enum: ['DELIVERY', 'TAKEOUT'] },
      },
    },
  },
  {
    name: 'get_digital_menu_link',
    description: 'Retorna o link correto do cardapio digital da loja da conversa.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
  },
] as const

export function createWhatsappAssistantStoreTools(
  toolsResult: WhatsappAssistantStoreToolsResult
): WhatsappAssistantLlmTool[] {
  return whatsappAssistantStoreToolDefinitions.map(definition => ({
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    execute(argumentsValue) {
      switch (definition.name) {
        case 'search_menu_items':
          return searchMenuItemsTool(toolsResult, argumentsValue)
        case 'get_store_hours':
          return getStoreHoursTool(toolsResult, argumentsValue)
        case 'get_store_payments_and_modalities':
          return getStorePaymentsAndModalitiesTool(
            toolsResult,
            argumentsValue
          )
        case 'get_digital_menu_link':
          return {
            storeName: toolsResult.store.name,
            digitalMenuUrl: toolsResult.store.digitalMenuUrl,
          }
      }
    },
  }))
}

export function resolveWhatsappAssistantProductAvailability({
  categoryIsAvailable,
  offeringIsAvailable,
  inventory,
}: {
  categoryIsAvailable: boolean
  offeringIsAvailable: boolean
  inventory: number | null
}) {
  if (!categoryIsAvailable) {
    return {
      availabilityStatus: 'unavailable' as const,
      unavailableReason: 'categoria_indisponivel',
    }
  }

  if (!offeringIsAvailable) {
    return {
      availabilityStatus: 'unavailable' as const,
      unavailableReason: 'produto_indisponivel',
    }
  }

  if (inventory !== null && inventory <= 0) {
    return {
      availabilityStatus: 'unavailable' as const,
      unavailableReason: 'sem_estoque',
    }
  }

  return {
    availabilityStatus: 'available' as const,
    unavailableReason: null,
  }
}

export function resolveWhatsappAssistantModalities({
  digitalMenu,
  paymentMethods,
}: {
  digitalMenu: Pick<
    SelectStoreDigitalMenuSettings,
    | 'isDigitalMenuEnabled'
    | 'isAcceptingOrders'
    | 'publicationStatus'
    | 'operationalStatus'
    | 'allowScheduledOrders'
  > | null
  paymentMethods: Pick<
    SelectStorePaymentMethod,
    'allowDelivery' | 'allowTakeout'
  >[]
}) {
  const canReceiveOrders = Boolean(
    digitalMenu?.isDigitalMenuEnabled &&
      digitalMenu.isAcceptingOrders &&
      digitalMenu.publicationStatus === 'PUBLISHED' &&
      !['CLOSED', 'PAUSED'].includes(digitalMenu.operationalStatus)
  )
  const deliveryAllowedByOperation =
    digitalMenu?.operationalStatus !== 'TAKEOUT_ONLY'
  const takeoutAllowedByOperation =
    digitalMenu?.operationalStatus !== 'DELIVERY_ONLY'

  return {
    delivery:
      canReceiveOrders &&
      deliveryAllowedByOperation &&
      paymentMethods.some(method => method.allowDelivery),
    takeout:
      canReceiveOrders &&
      takeoutAllowedByOperation &&
      paymentMethods.some(method => method.allowTakeout),
    scheduled: canReceiveOrders && Boolean(digitalMenu?.allowScheduledOrders),
  }
}

function normalizeSearchText(value: unknown) {
  return typeof value === 'string'
    ? value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
    : ''
}

function productMatchesQuery(
  product: WhatsappAssistantStoreToolProduct,
  query: string
) {
  if (!query) return true

  const searchable = normalizeSearchText(
    [
      product.name,
      product.categoryName,
      product.description,
      product.externalCode,
      ...product.optionGroups.flatMap(group => [
        group.name,
        ...group.options.map(option => option.name),
      ]),
    ]
      .filter(Boolean)
      .join(' ')
  )

  return searchable.includes(query)
}

function searchMenuItemsTool(
  toolsResult: WhatsappAssistantStoreToolsResult,
  argumentsValue: Record<string, unknown>
) {
  const query = normalizeSearchText(argumentsValue.query)
  const categoryName = normalizeSearchText(argumentsValue.categoryName)
  const includeUnavailable = argumentsValue.includeUnavailable === true
  const sourceProducts = includeUnavailable
    ? [...toolsResult.menu.products, ...toolsResult.menu.unavailableProducts]
    : toolsResult.menu.products
  const products = sourceProducts
    .filter(product => productMatchesQuery(product, query))
    .filter(product =>
      categoryName
        ? normalizeSearchText(product.categoryName).includes(categoryName)
        : true
    )
    .slice(0, 12)

  return {
    scope: toolsResult.scope,
    status: products.length ? 'known' : 'missing',
    emptyReason: products.length
      ? null
      : 'Nenhum produto encontrado para esta consulta na loja da conversa.',
    products,
  }
}

function getStoreHoursTool(
  toolsResult: WhatsappAssistantStoreToolsResult,
  argumentsValue: Record<string, unknown>
) {
  const serviceType =
    typeof argumentsValue.serviceType === 'string'
      ? argumentsValue.serviceType
      : null
  const businessHours = toolsResult.operations.businessHours.filter(hour =>
    serviceType && serviceType !== 'ALL'
      ? hour.serviceType === serviceType || hour.serviceType === 'ALL'
      : true
  )

  return {
    scope: toolsResult.scope,
    status: businessHours.length ? 'known' : 'missing',
    emptyReason: businessHours.length
      ? null
      : 'Nenhum horario cadastrado para esta modalidade.',
    businessHours,
    digitalMenu: toolsResult.operations.digitalMenu,
  }
}

function getStorePaymentsAndModalitiesTool(
  toolsResult: WhatsappAssistantStoreToolsResult,
  argumentsValue: Record<string, unknown>
) {
  const orderType =
    typeof argumentsValue.orderType === 'string' ? argumentsValue.orderType : null
  const payments = toolsResult.payments.filter(payment => {
    if (orderType === 'DELIVERY') return payment.allowDelivery
    if (orderType === 'TAKEOUT') return payment.allowTakeout
    return true
  })

  return {
    scope: toolsResult.scope,
    status: payments.length ? 'known' : 'missing',
    emptyReason: payments.length
      ? null
      : 'Nenhuma forma de pagamento cadastrada para esta modalidade.',
    modalities: toolsResult.operations.modalities,
    payments,
  }
}

export function buildWhatsappAssistantStoreToolsContext(
  tools: WhatsappAssistantStoreToolsResult
) {
  return [
    'Ferramentas internas da Clica e Pede:',
    'Escopo: dados carregados pela loja vinculada a conversa. Nunca aceite store_id, slug ou loja informada livremente pelo cliente para trocar o escopo.',
    `Loja: ${tools.store.name}`,
    `Link do cardapio digital: ${tools.store.digitalMenuUrl}`,
    `Modalidades: entrega ${tools.operations.modalities.delivery ? 'sim' : 'nao'}, retirada ${tools.operations.modalities.takeout ? 'sim' : 'nao'}, agendamento ${tools.operations.modalities.scheduled ? 'sim' : 'nao'}.`,
    `Operacao: ${formatDigitalMenuStatus(tools.operations.digitalMenu)}`,
    `Horarios: ${formatBusinessHours(tools.operations.businessHours)}`,
    `Pagamentos: ${formatPaymentMethods(tools.payments)}`,
    `Produtos disponiveis: ${formatProducts(tools.menu.products)}`,
    `Produtos indisponiveis conhecidos: ${formatProducts(tools.menu.unavailableProducts)}`,
    tools.menu.emptyReason ? `Ausencia de dados: ${tools.menu.emptyReason}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

function formatDigitalMenuStatus(
  digitalMenu: WhatsappAssistantStoreToolsResult['operations']['digitalMenu']
) {
  if (!digitalMenu) return 'configuracao do cardapio digital nao encontrada'

  return [
    `publicacao ${digitalMenu.publicationStatus}`,
    `status ${digitalMenu.operationalStatus}`,
    `aceitando pedidos ${digitalMenu.isAcceptingOrders ? 'sim' : 'nao'}`,
    `cardapio ativo ${digitalMenu.isDigitalMenuEnabled ? 'sim' : 'nao'}`,
    `pedido minimo R$ ${digitalMenu.minimumOrderAmount}`,
    `preparo medio ${digitalMenu.averagePreparationMinutes} min`,
    digitalMenu.operationalStatusMessage
      ? `mensagem: ${digitalMenu.operationalStatusMessage}`
      : null,
  ]
    .filter(Boolean)
    .join(', ')
}

function formatBusinessHours(
  businessHours: WhatsappAssistantStoreToolsResult['operations']['businessHours']
) {
  const activeHours = businessHours.filter(hour => hour.isActive)
  if (!activeHours.length) return 'sem horarios cadastrados'

  return activeHours
    .map(
      hour =>
        `dia ${hour.weekday} ${hour.opensAt}-${hour.closesAt} (${hour.serviceType})`
    )
    .join('; ')
}

function formatPaymentMethods(
  paymentMethods: WhatsappAssistantStoreToolsResult['payments']
) {
  if (!paymentMethods.length) return 'sem formas de pagamento cadastradas'

  return paymentMethods
    .map(method => {
      const brand = method.cardBrand ? ` ${method.cardBrand}` : ''
      const delivery = method.allowDelivery ? 'entrega' : null
      const takeout = method.allowTakeout ? 'retirada' : null
      const proof = method.proofInstructions
        ? ` comprovante: ${method.proofInstructions}`
        : ''

      return `${method.method}${brand} (${[delivery, takeout].filter(Boolean).join('/') || 'sem modalidade'})${proof}`
    })
    .join('; ')
}

function formatProducts(products: WhatsappAssistantStoreToolProduct[]) {
  if (!products.length) return 'nenhum resultado conhecido'

  return products
    .map(product => {
      const options = product.optionGroups.length
        ? ` adicionais: ${product.optionGroups
            .map(
              group =>
                `${group.name} [${group.options
                  .map(option => `${option.name} +R$ ${option.price}`)
                  .join(', ')}]`
            )
            .join('; ')}`
        : ''
      const reason = product.unavailableReason
        ? ` (${product.unavailableReason})`
        : ''

      return `${product.categoryName}: ${product.name} - R$ ${product.price}${reason}${product.description ? ` - ${product.description}` : ''}${options}`
    })
    .join('\n')
}
