import { describe, expect, test } from 'bun:test'
import { quoteDigitalMenuDelivery } from './delivery'
import { DigitalMenuDeliveryZone, DigitalMenuSettings } from './types'

const settings: DigitalMenuSettings = {
  whatsappPhone: null,
  isDigitalMenuEnabled: true,
  isAcceptingOrders: true,
  operationalStatus: 'OPEN',
  operationalStatusMessage: null,
  manualPauseReason: null,
  minimumOrderAmount: '25.0000',
  averagePreparationMinutes: 35,
  allowScheduledOrders: false,
  scheduleMinLeadMinutes: 30,
  scheduleMaxDaysAhead: 7,
  allowItemObservations: true,
}

const baseZone: DigitalMenuDeliveryZone = {
  id: 1,
  type: 'NEIGHBORHOOD',
  name: 'Centro',
  neighborhood: 'Centro',
  postalCodePrefix: null,
  centerLat: null,
  centerLng: null,
  radiusMeters: null,
  deliveryFee: '7.0000',
  freeDeliveryMinimum: null,
  minimumOrderAmount: null,
  estimatedDeliveryMinutes: 40,
  priority: 0,
  isActive: true,
}

describe('quoteDigitalMenuDelivery', () => {
  test('calcula taxa e prazo por bairro com frete gratis por minimo', () => {
    const quote = quoteDigitalMenuDelivery({
      zones: [
        {
          ...baseZone,
          freeDeliveryMinimum: '50.0000',
          minimumOrderAmount: '30.0000',
        },
      ],
      neighborhood: 'centro',
      subtotal: '55.0000',
      settings,
    })

    expect(quote.deliveryFee).toBe('0')
    expect(quote.minimumOrderAmount).toBe('30.0000')
    expect(quote.deliveryEstimatedMinutes).toBe(40)
    expect(quote.deliveryZoneId).toBe(1)
  })

  test('calcula taxa por prefixo de CEP', () => {
    const quote = quoteDigitalMenuDelivery({
      zones: [
        {
          ...baseZone,
          id: 2,
          type: 'POSTAL_CODE',
          name: 'CEP 01001',
          neighborhood: null,
          postalCodePrefix: '01001',
          deliveryFee: '9.5000',
        },
      ],
      postalCode: '01001-000',
      subtotal: '40.0000',
      settings,
    })

    expect(quote.deliveryFee).toBe('9.5000')
    expect(quote.deliveryZoneId).toBe(2)
  })

  test('usa taxa fixa quando ela e a regra aplicavel', () => {
    const quote = quoteDigitalMenuDelivery({
      zones: [
        {
          ...baseZone,
          id: 6,
          type: 'FIXED',
          name: 'Entrega padrao',
          neighborhood: null,
          deliveryFee: '5.0000',
        },
      ],
      subtotal: '40.0000',
      settings,
    })

    expect(quote.deliveryFee).toBe('5.0000')
    expect(quote.deliveryZoneId).toBe(6)
  })

  test('calcula taxa por raio quando cliente compartilha localizacao', () => {
    const quote = quoteDigitalMenuDelivery({
      zones: [
        {
          ...baseZone,
          id: 3,
          type: 'RADIUS',
          name: 'Raio 2 km',
          neighborhood: null,
          centerLat: '-23.5505200',
          centerLng: '-46.6333080',
          radiusMeters: 2000,
          deliveryFee: '12.0000',
        },
      ],
      customerLatitude: -23.551,
      customerLongitude: -46.634,
      subtotal: '40.0000',
      settings,
    })

    expect(quote.deliveryFee).toBe('12.0000')
    expect(quote.deliveryZoneId).toBe(3)
  })

  test('bloqueia endereco fora da area atendida', () => {
    let message = ''

    try {
      quoteDigitalMenuDelivery({
        zones: [baseZone],
        neighborhood: 'Outro bairro',
        subtotal: '40.0000',
        settings,
      })
    } catch (error) {
      message = error instanceof Error ? error.message : ''
    }

    expect(message).toBe('Ainda nao entregamos neste endereco.')
  })

  test('solicita localizacao quando ha apenas regra por raio', () => {
    let message = ''

    try {
      quoteDigitalMenuDelivery({
        zones: [
          {
            ...baseZone,
            type: 'RADIUS',
            neighborhood: null,
            centerLat: '-23.5505200',
            centerLng: '-46.6333080',
            radiusMeters: 2000,
          },
        ],
        subtotal: '40.0000',
        settings,
      })
    } catch (error) {
      message = error instanceof Error ? error.message : ''
    }

    expect(message).toBe('Compartilhe sua localizacao para calcular a entrega.')
  })
})
