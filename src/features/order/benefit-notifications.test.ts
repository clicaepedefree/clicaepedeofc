import { describe, expect, test } from 'bun:test'

import {
  buildOrderBenefitNotificationEventId,
  buildOrderBenefitWhatsappNotifications,
  extractOrderBenefitNotificationGrants,
} from './benefit-notifications'

const baseInput = {
  storeName: 'Ccocobongo',
  storeSubdomain: 'ccocobongo',
  orderId: 123,
  orderDisplayId: '42',
  customerPhone: '5513991840862',
  orderStatus: 'COMPLETED',
}

describe('order benefit whatsapp notifications', () => {
  test('builds cashback message with real earned amount and updated balance', () => {
    const [notification] = buildOrderBenefitWhatsappNotifications({
      ...baseInput,
      snapshot: {
        benefits: {
          cashback: {
            grantId: 'cashback-1',
            earnedAmount: '5.50',
            balanceAmount: '13.75',
            expiresAt: '2026-12-31T03:00:00.000Z',
            ruleDescription: 'Valido em pedidos acima de R$ 30,00',
          },
        },
      },
    })

    expect(notification).toMatchObject({
      eventType: 'cashback',
      eventId: 'order:123:benefit:cashback:cashback-1',
      grantId: 'cashback-1',
    })
    expect(notification?.text).toMatch(/R\$\s*5,50 de cashback/)
    expect(notification?.text).toMatch(/Saldo atualizado: R\$\s*13,75/)
    expect(notification?.text).toContain('Validade: 31/12/2026')
    expect(notification?.text).toContain('/cardapio/ccocobongo')
    expect(notification?.payload).toMatchObject({
      earnedAmount: '5.50',
      balanceAmount: '13.75',
    })
  })

  test('builds loyalty message with real earned points and updated balance', () => {
    const [notification] = buildOrderBenefitWhatsappNotifications({
      ...baseInput,
      snapshot: {
        benefits: {
          grants: [
            {
              type: 'loyalty',
              grantId: 'loyalty-1',
              earnedPoints: 3,
              balancePoints: 9,
              nextRewardDescription: 'Faltam 3 pontos para ganhar um combo.',
            },
          ],
        },
      },
    })

    expect(notification).toMatchObject({
      eventType: 'loyalty',
      eventId: 'order:123:benefit:loyalty:loyalty-1',
      grantId: 'loyalty-1',
    })
    expect(notification?.text).toContain('ganhou 3 pontos')
    expect(notification?.text).toContain('Saldo atualizado: 9 pontos')
    expect(notification?.text).toContain('Proxima recompensa')
    expect(notification?.text).toContain('utm_campaign=benefit_notification')
  })

  test('does not create fictional notifications without confirmed benefits', () => {
    expect(
      buildOrderBenefitWhatsappNotifications({
        ...baseInput,
        snapshot: { benefits: { cashback: { grantId: 'cashback-2' } } },
      })
    ).toEqual([])

    expect(
      buildOrderBenefitWhatsappNotifications({
        ...baseInput,
        snapshot: {
          benefits: {
            loyalty: {
              grantId: 'loyalty-2',
              earnedPoints: 0,
              balancePoints: 10,
            },
          },
        },
      })
    ).toEqual([])
  })

  test('notifies only after completed orders with a customer phone', () => {
    expect(
      buildOrderBenefitWhatsappNotifications({
        ...baseInput,
        orderStatus: 'READY',
        snapshot: {
          benefits: {
            cashback: {
              grantId: 'cashback-3',
              earnedAmount: 1,
              balanceAmount: 1,
            },
          },
        },
      })
    ).toEqual([])

    expect(
      buildOrderBenefitWhatsappNotifications({
        ...baseInput,
        customerPhone: null,
        snapshot: {
          benefits: {
            cashback: {
              grantId: 'cashback-3',
              earnedAmount: 1,
              balanceAmount: 1,
            },
          },
        },
      })
    ).toEqual([])
  })

  test('includes optional validity and reward details only when confirmed', () => {
    const [notification] = buildOrderBenefitWhatsappNotifications({
      ...baseInput,
      snapshot: {
        benefits: {
          cashback: {
            grantId: 'cashback-4',
            earnedAmount: '2',
            balanceAmount: '2',
          },
        },
      },
    })

    expect(notification?.text).not.toContain('Validade:')
    expect(notification?.text).not.toContain('Proxima recompensa:')
  })

  test('keeps idempotency stable per grant', () => {
    expect(
      buildOrderBenefitNotificationEventId({
        orderId: 123,
        type: 'cashback',
        grantId: 'grant-1',
      })
    ).toBe('order:123:benefit:cashback:grant-1')

    expect(
      buildOrderBenefitNotificationEventId({
        orderId: 123,
        type: 'loyalty',
        grantId: 'grant-1',
      })
    ).toBe('order:123:benefit:loyalty:grant-1')
  })

  test('extracts grant arrays and named benefit records', () => {
    expect(
      extractOrderBenefitNotificationGrants({
        benefits: {
          cashback: {
            grantId: 'cashback-5',
            earnedAmount: '1',
            balanceAmount: '1',
          },
          loyalty: {
            grantId: 'loyalty-5',
            earnedPoints: 1,
            balancePoints: 1,
          },
        },
      }).map(grant => grant.type)
    ).toEqual(['cashback', 'loyalty'])
  })
})
