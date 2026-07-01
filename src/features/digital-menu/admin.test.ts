import { describe, expect, test } from 'bun:test'
import {
  buildDigitalMenuPath,
  buildDigitalMenuReadiness,
  canPublishDigitalMenu,
  deriveDigitalMenuPublicationStatus,
} from './admin'

describe('digital menu admin', () => {
  test('derives draft, paused and published without confusing closed hours', () => {
    expect(
      deriveDigitalMenuPublicationStatus({
        publicationStatus: null,
        isDigitalMenuEnabled: false,
        isAcceptingOrders: true,
        operationalStatus: 'OPEN',
      })
    ).toBe('DRAFT')
    expect(
      deriveDigitalMenuPublicationStatus({
        publicationStatus: null,
        isDigitalMenuEnabled: true,
        isAcceptingOrders: false,
        operationalStatus: 'OPEN',
      })
    ).toBe('PAUSED')
    expect(
      deriveDigitalMenuPublicationStatus({
        publicationStatus: null,
        isDigitalMenuEnabled: true,
        isAcceptingOrders: true,
        operationalStatus: 'CLOSED',
      })
    ).toBe('PUBLISHED')
    expect(
      deriveDigitalMenuPublicationStatus({
        publicationStatus: 'PAUSED',
        isDigitalMenuEnabled: true,
        isAcceptingOrders: true,
        operationalStatus: 'OPEN',
      })
    ).toBe('PAUSED')
  })

  test('only operational readiness blocks publication', () => {
    const readiness = buildDigitalMenuReadiness({
      availableProducts: 1,
      activeBusinessHours: 1,
      activePaymentMethods: 1,
      activeDeliveryZones: 0,
      allowsTakeout: true,
      hasPublicIdentity: false,
    })

    expect(canPublishDigitalMenu(readiness)).toBe(true)
    expect(readiness.find(item => item.id === 'identity')?.ready).toBe(false)
  })

  test('blocks publication when a required operational item is missing', () => {
    const readiness = buildDigitalMenuReadiness({
      availableProducts: 0,
      activeBusinessHours: 1,
      activePaymentMethods: 1,
      activeDeliveryZones: 1,
      allowsTakeout: false,
      hasPublicIdentity: true,
    })

    expect(canPublishDigitalMenu(readiness)).toBe(false)
  })

  test('encodes the public slug', () => {
    expect(buildDigitalMenuPath('loja teste')).toBe('/cardapio/loja%20teste')
  })
})
