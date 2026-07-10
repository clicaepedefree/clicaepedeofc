import { describe, expect, test } from 'bun:test'
import {
  DigitalMenuAvailabilitySettings,
  evaluateDigitalMenuAvailability,
  getDigitalMenuOrderTypeControls,
} from './availability'

const baseSettings: DigitalMenuAvailabilitySettings = {
  isDigitalMenuEnabled: true,
  isAcceptingOrders: true,
  operationalStatus: 'OPEN',
  operationalStatusMessage: null,
  manualPauseReason: null,
  manualPauseUntil: null,
  allowScheduledOrders: true,
}

const mondayNoon = new Date('2026-05-18T15:00:00.000Z')
const mondayAfternoon = new Date('2026-05-18T19:00:00.000Z')
const mondayNight = new Date('2026-05-18T22:00:00.000Z')

describe('evaluateDigitalMenuAvailability', () => {
  test('permite multiplos periodos no mesmo dia', () => {
    const businessHours = [
      {
        weekday: 1,
        opensAt: '11:00:00',
        closesAt: '14:00:00',
        serviceType: 'ALL' as const,
        isActive: true,
      },
      {
        weekday: 1,
        opensAt: '18:00:00',
        closesAt: '22:00:00',
        serviceType: 'ALL' as const,
        isActive: true,
      },
    ]

    expect(
      evaluateDigitalMenuAvailability({
        settings: baseSettings,
        businessHours,
        specialHours: [],
        serviceType: 'DELIVERY',
        now: mondayNoon,
      }).isOpen
    ).toBe(true)

    expect(
      evaluateDigitalMenuAvailability({
        settings: baseSettings,
        businessHours,
        specialHours: [],
        serviceType: 'DELIVERY',
        now: mondayAfternoon,
      }).isOpen
    ).toBe(false)

    expect(
      evaluateDigitalMenuAvailability({
        settings: baseSettings,
        businessHours,
        specialHours: [],
        serviceType: 'DELIVERY',
        now: mondayNight,
      }).isOpen
    ).toBe(true)
  })

  test('data especial fechada bloqueia pedidos e exibe motivo', () => {
    const result = evaluateDigitalMenuAvailability({
      settings: baseSettings,
      businessHours: [],
      specialHours: [
        {
          date: '2026-05-18',
          reason: 'Feriado municipal',
          isClosed: true,
          opensAt: null,
          closesAt: null,
          serviceType: 'ALL',
        },
      ],
      serviceType: 'DELIVERY',
      now: mondayNoon,
    })

    expect(result.isOpen).toBe(false)
    expect(result.reason).toBe('Feriado municipal')
    expect(result.canSchedule).toBe(true)
  })

  test('status apenas retirada bloqueia delivery e libera retirada', () => {
    const settings = {
      ...baseSettings,
      operationalStatus: 'TAKEOUT_ONLY' as const,
    }

    expect(
      evaluateDigitalMenuAvailability({
        settings,
        businessHours: [
          {
            weekday: 1,
            opensAt: '00:00:00',
            closesAt: '23:59:59',
            serviceType: 'ALL',
            isActive: true,
          },
        ],
        specialHours: [],
        serviceType: 'DELIVERY',
        now: mondayNoon,
      }).isOpen
    ).toBe(false)

    expect(
      evaluateDigitalMenuAvailability({
        settings,
        businessHours: [
          {
            weekday: 1,
            opensAt: '00:00:00',
            closesAt: '23:59:59',
            serviceType: 'ALL',
            isActive: true,
          },
        ],
        specialHours: [],
        serviceType: 'TAKEOUT',
        now: mondayNoon,
      }).isOpen
    ).toBe(true)
  })

  test('controles de modalidade trocam para retirada quando delivery esta bloqueado', () => {
    const delivery = evaluateDigitalMenuAvailability({
      settings: {
        ...baseSettings,
        operationalStatus: 'TAKEOUT_ONLY',
        operationalStatusMessage: 'QA apenas retirada KAN-1',
      },
      businessHours: [
        {
          weekday: 1,
          opensAt: '00:00:00',
          closesAt: '23:59:59',
          serviceType: 'ALL',
          isActive: true,
        },
      ],
      specialHours: [],
      serviceType: 'DELIVERY',
      now: mondayNoon,
    })
    const takeout = evaluateDigitalMenuAvailability({
      settings: {
        ...baseSettings,
        operationalStatus: 'TAKEOUT_ONLY',
        operationalStatusMessage: 'QA apenas retirada KAN-1',
      },
      businessHours: [
        {
          weekday: 1,
          opensAt: '00:00:00',
          closesAt: '23:59:59',
          serviceType: 'ALL',
          isActive: true,
        },
      ],
      specialHours: [],
      serviceType: 'TAKEOUT',
      now: mondayNoon,
    })

    const controls = getDigitalMenuOrderTypeControls({
      currentOrderType: 'DELIVERY',
      delivery,
      takeout,
      deliveryConfigured: true,
    })

    expect(controls.preferredOrderType).toBe('TAKEOUT')
    expect(controls.delivery.enabled).toBe(false)
    expect(controls.delivery.reason).toBe('QA apenas retirada KAN-1')
    expect(controls.takeout.enabled).toBe(true)
  })

  test('controles de modalidade trocam para entrega quando retirada esta bloqueada', () => {
    const settings = {
      ...baseSettings,
      operationalStatus: 'DELIVERY_ONLY' as const,
      operationalStatusMessage: 'QA apenas delivery KAN-1',
    }
    const businessHours = [
      {
        weekday: 1,
        opensAt: '00:00:00',
        closesAt: '23:59:59',
        serviceType: 'ALL' as const,
        isActive: true,
      },
    ]

    const controls = getDigitalMenuOrderTypeControls({
      currentOrderType: 'TAKEOUT',
      delivery: evaluateDigitalMenuAvailability({
        settings,
        businessHours,
        specialHours: [],
        serviceType: 'DELIVERY',
        now: mondayNoon,
      }),
      takeout: evaluateDigitalMenuAvailability({
        settings,
        businessHours,
        specialHours: [],
        serviceType: 'TAKEOUT',
        now: mondayNoon,
      }),
      deliveryConfigured: true,
    })

    expect(controls.preferredOrderType).toBe('DELIVERY')
    expect(controls.delivery.enabled).toBe(true)
    expect(controls.takeout.enabled).toBe(false)
    expect(controls.takeout.reason).toBe('QA apenas delivery KAN-1')
  })

  test('ausencia de horarios fecha pedidos com mensagem clara', () => {
    const result = evaluateDigitalMenuAvailability({
      settings: baseSettings,
      businessHours: [],
      specialHours: [],
      serviceType: 'DELIVERY',
      now: mondayNoon,
    })

    expect(result.isOpen).toBe(false)
    expect(result.canSchedule).toBe(false)
    expect(result.reason).toBe(
      'A loja ainda nao configurou horarios para este tipo de pedido.'
    )
    expect(result.statusLabel).toBe('Horarios indisponiveis')
  })

  test('fora do horario permite agendamento quando configurado', () => {
    const result = evaluateDigitalMenuAvailability({
      settings: baseSettings,
      businessHours: [
        {
          weekday: 1,
          opensAt: '11:00:00',
          closesAt: '14:00:00',
          serviceType: 'DELIVERY',
          isActive: true,
        },
      ],
      specialHours: [],
      serviceType: 'DELIVERY',
      now: mondayAfternoon,
    })

    expect(result.isOpen).toBe(false)
    expect(result.canSchedule).toBe(true)
    expect(result.statusLabel).toBe('Fora do horario')
  })

  test('status pausado usa mensagem personalizada', () => {
    const result = evaluateDigitalMenuAvailability({
      settings: {
        ...baseSettings,
        operationalStatus: 'PAUSED',
        operationalStatusMessage: 'Pausamos por alta demanda.',
      },
      businessHours: [],
      specialHours: [],
      serviceType: 'DELIVERY',
      now: mondayNoon,
    })

    expect(result.isOpen).toBe(false)
    expect(result.reason).toBe('Pausamos por alta demanda.')
    expect(result.statusLabel).toBe('Pausada')
  })
})
