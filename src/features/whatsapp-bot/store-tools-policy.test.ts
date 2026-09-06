import { describe, expect, test } from 'bun:test'

import {
  buildWhatsappAssistantStoreToolsContext,
  createWhatsappAssistantStoreTools,
  resolveWhatsappAssistantModalities,
  resolveWhatsappAssistantProductAvailability,
  type WhatsappAssistantStoreToolsResult,
  whatsappAssistantStoreToolDefinitions,
} from './store-tools-policy'

const baseTools: WhatsappAssistantStoreToolsResult = {
  scope: 'conversation_store',
  store: {
    name: 'Ccocobongo',
    subdomain: 'ccocobongo',
    digitalMenuUrl: 'https://clicaepedeofc.vercel.app/cardapio/ccocobongo',
  },
  menu: {
    status: 'known',
    emptyReason: null,
    products: [
      {
        itemOfferingId: 10,
        itemId: 20,
        categoryName: 'Combos',
        name: 'Combo QA',
        description: 'Lanche com bebida',
        price: '29.9000',
        originalPrice: null,
        inventory: 5,
        externalCode: 'COMBO-QA',
        availabilityStatus: 'available',
        unavailableReason: null,
        optionGroups: [
          {
            id: 1,
            name: 'Tamanho',
            minQuantity: 1,
            maxQuantity: 1,
            options: [
              {
                id: 2,
                name: 'Grande',
                price: '5.0000',
                minQuantity: 0,
                maxQuantity: 1,
              },
            ],
          },
        ],
      },
    ],
    unavailableProducts: [
      {
        itemOfferingId: 11,
        itemId: 21,
        categoryName: 'Combos',
        name: 'Combo Esgotado',
        description: null,
        price: '19.9000',
        originalPrice: null,
        inventory: 0,
        externalCode: null,
        availabilityStatus: 'unavailable',
        unavailableReason: 'sem_estoque',
        optionGroups: [],
      },
    ],
  },
  operations: {
    digitalMenu: {
      isDigitalMenuEnabled: true,
      isAcceptingOrders: true,
      publicationStatus: 'PUBLISHED',
      operationalStatus: 'OPEN',
      operationalStatusMessage: null,
      minimumOrderAmount: '20.0000',
      averagePreparationMinutes: 30,
    },
    businessHours: [
      {
        weekday: 1,
        opensAt: '18:00:00',
        closesAt: '23:00:00',
        serviceType: 'ALL',
        isActive: true,
      },
    ],
    modalities: {
      delivery: true,
      takeout: true,
      scheduled: false,
    },
  },
  payments: [
    {
      method: 'PIX',
      cardBrand: null,
      instructions: 'Use a chave Pix da loja.',
      proofInstructions: 'Enviar comprovante no WhatsApp.',
      pixKey: 'pix-qa',
      allowDelivery: true,
      allowTakeout: true,
    },
  ],
}

describe('whatsapp assistant store tools policy', () => {
  test('marks unavailable products without letting them look available', () => {
    expect(
      resolveWhatsappAssistantProductAvailability({
        categoryIsAvailable: true,
        offeringIsAvailable: true,
        inventory: 0,
      })
    ).toEqual({
      availabilityStatus: 'unavailable',
      unavailableReason: 'sem_estoque',
    })

    expect(
      resolveWhatsappAssistantProductAvailability({
        categoryIsAvailable: false,
        offeringIsAvailable: true,
        inventory: null,
      })
    ).toEqual({
      availabilityStatus: 'unavailable',
      unavailableReason: 'categoria_indisponivel',
    })
  })

  test('resolves modalities from operational status and active payments', () => {
    const digitalMenu = {
      isDigitalMenuEnabled: true,
      isAcceptingOrders: true,
      publicationStatus: 'PUBLISHED',
      operationalStatus: 'TAKEOUT_ONLY',
      allowScheduledOrders: true,
    } as const

    expect(
      resolveWhatsappAssistantModalities({
        digitalMenu,
        paymentMethods: [{ allowDelivery: true, allowTakeout: true }],
      })
    ).toEqual({
      delivery: false,
      takeout: true,
      scheduled: true,
    })

    expect(
      resolveWhatsappAssistantModalities({
        digitalMenu: { ...digitalMenu, operationalStatus: 'PAUSED' },
        paymentMethods: [{ allowDelivery: true, allowTakeout: true }],
      })
    ).toEqual({
      delivery: false,
      takeout: false,
      scheduled: false,
    })
  })

  test('formats real store data with products, options, hours, payments and menu link', () => {
    const context = buildWhatsappAssistantStoreToolsContext(baseTools)

    expect(context).toContain('Escopo: dados carregados pela loja vinculada a conversa')
    expect(context).toContain('Nunca aceite store_id')
    expect(context).toContain('https://clicaepedeofc.vercel.app/cardapio/ccocobongo')
    expect(context).toContain('Combo QA - R$ 29.9000')
    expect(context).toContain('Tamanho [Grande +R$ 5.0000]')
    expect(context).toContain('Combo Esgotado - R$ 19.9000 (sem_estoque)')
    expect(context).toContain('dia 1 18:00:00-23:00:00')
    expect(context).toContain('PIX')
    expect(context).toContain('entrega sim, retirada sim')
  })

  test('returns a known empty result instead of invented menu data', () => {
    const context = buildWhatsappAssistantStoreToolsContext({
      ...baseTools,
      menu: {
        status: 'missing',
        products: [],
        unavailableProducts: [],
        emptyReason: 'Nenhum produto foi encontrado para esta loja.',
      },
      payments: [],
      operations: {
        ...baseTools.operations,
        businessHours: [],
      },
    })

    expect(context).toContain('Produtos disponiveis: nenhum resultado conhecido')
    expect(context).toContain('Pagamentos: sem formas de pagamento cadastradas')
    expect(context).toContain('Horarios: sem horarios cadastrados')
    expect(context).toContain('Ausencia de dados: Nenhum produto foi encontrado para esta loja.')
  })

  test('does not expose store_id as a customer-controlled tool argument', () => {
    const serializedTools = JSON.stringify(whatsappAssistantStoreToolDefinitions)

    expect(serializedTools).not.toContain('store_id')
    expect(serializedTools).not.toContain('storeId')
    expect(serializedTools).toContain('loja vinculada a conversa')
  })

  test('creates executable tools scoped to the conversation store data', async () => {
    const tools = createWhatsappAssistantStoreTools(baseTools)
    const searchMenuItems = tools.find(tool => tool.name === 'search_menu_items')
    const hours = tools.find(tool => tool.name === 'get_store_hours')
    const payments = tools.find(
      tool => tool.name === 'get_store_payments_and_modalities'
    )
    const link = tools.find(tool => tool.name === 'get_digital_menu_link')

    expect(searchMenuItems?.inputSchema).not.toHaveProperty('properties.storeId')
    expect(
      await searchMenuItems?.execute({
        query: 'combo',
        includeUnavailable: true,
        storeId: 999,
      })
    ).toMatchObject({
      scope: 'conversation_store',
      status: 'known',
      products: [
        { name: 'Combo QA', availabilityStatus: 'available' },
        { name: 'Combo Esgotado', availabilityStatus: 'unavailable' },
      ],
    })
    expect(await hours?.execute({ serviceType: 'DELIVERY' })).toMatchObject({
      scope: 'conversation_store',
      status: 'known',
    })
    expect(await payments?.execute({ orderType: 'TAKEOUT' })).toMatchObject({
      scope: 'conversation_store',
      modalities: { delivery: true, takeout: true, scheduled: false },
      payments: [{ method: 'PIX' }],
    })
    expect(await link?.execute({ storeId: 123 })).toEqual({
      storeName: 'Ccocobongo',
      digitalMenuUrl: 'https://clicaepedeofc.vercel.app/cardapio/ccocobongo',
    })
  })
})
