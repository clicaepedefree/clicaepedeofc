import { describe, expect, test } from 'bun:test'
import {
  DigitalMenuAvailabilitySettings,
  evaluateDigitalMenuAvailability,
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
