import { describe, expect, test } from 'bun:test'

import {
  getEffectiveStoreModules,
  isActiveStoreModuleEntitlement,
} from './module-entitlements-policy'

const now = new Date('2026-08-12T12:00:00.000Z')

describe('module entitlements policy', () => {
  test('habilita modulos vindos do plano, adicional, cortesia e liberacao manual', () => {
    const result = getEffectiveStoreModules({
      at: now,
      planModules: [
        { code: 'digital_menu', status: 'active' },
        { code: 'pos', status: 'active' },
      ],
      storeEntitlements: [
        {
          code: 'whatsapp_bot',
          origin: 'addon',
          status: 'active',
          isAdditional: true,
        },
        {
          code: 'fiscal',
          origin: 'courtesy',
          status: 'active',
          isAdditional: false,
        },
        {
          code: 'reports_plus',
          origin: 'manual',
          status: 'active',
          isAdditional: false,
        },
      ],
    })

    expect(result).toEqual([
      {
        code: 'digital_menu',
        fromPlan: true,
        isAdditional: false,
        sources: ['plan'],
      },
      {
        code: 'fiscal',
        fromPlan: false,
        isAdditional: false,
        sources: ['courtesy'],
      },
      {
        code: 'pos',
        fromPlan: true,
        isAdditional: false,
        sources: ['plan'],
      },
      {
        code: 'reports_plus',
        fromPlan: false,
        isAdditional: false,
        sources: ['manual'],
      },
      {
        code: 'whatsapp_bot',
        fromPlan: false,
        isAdditional: true,
        sources: ['addon'],
      },
    ])
  })

  test('desativacao preserva o registro historico sem conceder acesso efetivo', () => {
    const entitlement = {
      code: 'fiscal',
      origin: 'manual' as const,
      status: 'revoked' as const,
      isAdditional: false,
      startsAt: new Date('2026-08-01T00:00:00.000Z'),
      revokedAt: new Date('2026-08-10T00:00:00.000Z'),
    }

    expect(isActiveStoreModuleEntitlement(entitlement, now)).toBe(false)
    expect(entitlement.revokedAt?.toISOString()).toBe(
      '2026-08-10T00:00:00.000Z'
    )
  })

  test('mudanca de plano recalcula modulos padrao sem perder excecoes da loja', () => {
    const exceptionEntitlements = [
      {
        code: 'pos',
        origin: 'plan' as const,
        status: 'active' as const,
        isAdditional: false,
      },
      {
        code: 'whatsapp_bot',
        origin: 'addon' as const,
        status: 'active' as const,
        isAdditional: true,
      },
      {
        code: 'fiscal',
        origin: 'courtesy' as const,
        status: 'active' as const,
        isAdditional: false,
      },
    ]

    const basicPlan = getEffectiveStoreModules({
      at: now,
      planModules: [
        { code: 'digital_menu', status: 'active' },
        { code: 'pos', status: 'active' },
      ],
      storeEntitlements: exceptionEntitlements,
    })

    const proPlan = getEffectiveStoreModules({
      at: now,
      planModules: [
        { code: 'digital_menu', status: 'active' },
        { code: 'reports', status: 'active' },
      ],
      storeEntitlements: exceptionEntitlements,
    })

    expect(basicPlan.map(module => module.code)).toEqual([
      'digital_menu',
      'fiscal',
      'pos',
      'whatsapp_bot',
    ])
    expect(proPlan.map(module => module.code)).toEqual([
      'digital_menu',
      'fiscal',
      'reports',
      'whatsapp_bot',
    ])
  })
})
