import { describe, expect, test } from 'bun:test'
import {
  buildOrderStatusNotificationEventId,
  buildOrderStatusWhatsappNotification,
  parseOrderStatusNotificationTemplateOverrides,
} from './status-notifications'

describe('order status whatsapp notifications', () => {
  test('builds deterministic event ids by order and normalized status', () => {
    expect(
      buildOrderStatusNotificationEventId({ orderId: 42, status: 'PENDING' })
    ).toBe('order:42:status:RECEIVED')
    expect(
      buildOrderStatusNotificationEventId({
        orderId: 42,
        status: 'SENT_TO_STORE',
      })
    ).toBe('order:42:status:RECEIVED')
    expect(
      buildOrderStatusNotificationEventId({ orderId: 42, status: 'ACCEPTED' })
    ).toBe('order:42:status:ACCEPTED')
  })

  test('includes store, order and status in the default message', () => {
    const result = buildOrderStatusWhatsappNotification({
      storeName: 'Ccocobongo',
      orderDisplayId: '12',
      orderType: 'DELIVERY',
      fromStatus: 'ACCEPTED',
      toStatus: 'IN_PREPARATION',
    })

    expect(result).toMatchObject({
      shouldNotify: true,
      eventStatus: 'IN_PREPARATION',
      title: 'Pedido em preparo',
    })
    expect(result.shouldNotify ? result.text : '').toContain('Ccocobongo')
    expect(result.shouldNotify ? result.text : '').toContain('#12')
    expect(result.shouldNotify ? result.text : '').toContain(
      'Pedido em preparo'
    )
  })

  test('does not notify delivery-only status for takeout orders', () => {
    expect(
      buildOrderStatusWhatsappNotification({
        storeName: 'Ccocobongo',
        orderDisplayId: '13',
        orderType: 'TAKEOUT',
        fromStatus: 'READY',
        toStatus: 'OUT_FOR_DELIVERY',
      })
    ).toEqual({ shouldNotify: false, reason: 'status_not_applicable' })
  })

  test('keeps cancellation copy neutral about refunds', () => {
    const result = buildOrderStatusWhatsappNotification({
      storeName: 'Ccocobongo',
      orderDisplayId: '14',
      orderType: 'DELIVERY',
      fromStatus: 'IN_PREPARATION',
      toStatus: 'CANCELLED',
      reason: 'Cliente desistiu',
    })

    expect(result.shouldNotify).toBe(true)
    expect(result.shouldNotify ? result.text : '').toContain('cancelado')
    expect(result.shouldNotify ? result.text : '').not.toMatch(
      /estorno|reembolso/i
    )
  })

  test('ignores out-of-order non-terminal regressions', () => {
    expect(
      buildOrderStatusWhatsappNotification({
        storeName: 'Ccocobongo',
        orderDisplayId: '15',
        orderType: 'DELIVERY',
        fromStatus: 'READY',
        toStatus: 'ACCEPTED',
      })
    ).toEqual({ shouldNotify: false, reason: 'out_of_order' })
  })

  test('allows controlled custom templates with known placeholders only', () => {
    const result = buildOrderStatusWhatsappNotification({
      storeName: 'Ccocobongo',
      orderDisplayId: '16',
      orderType: 'DELIVERY',
      toStatus: 'ACCEPTED',
      templateOverrides: {
        ACCEPTED:
          '{{storeName}} confirmou o pedido {{orderDisplayId}}: {{statusTitle}}',
      },
    })

    expect(result.shouldNotify ? result.text : '').toBe(
      'Ccocobongo confirmou o pedido 16: Pedido confirmado'
    )

    const fallback = buildOrderStatusWhatsappNotification({
      storeName: 'Ccocobongo',
      orderDisplayId: '17',
      orderType: 'DELIVERY',
      toStatus: 'ACCEPTED',
      templateOverrides: {
        ACCEPTED: '{{unsafe.secret}} {{storeName}}',
      },
    })

    expect(fallback.shouldNotify ? fallback.text : '').toContain(
      'Atualizacao da Ccocobongo'
    )
  })

  test('parses only safe custom templates from assistant metadata', () => {
    expect(
      parseOrderStatusNotificationTemplateOverrides({
        orderStatusTemplates: {
          ACCEPTED: '{{storeName}} aceitou o pedido {{orderDisplayId}}',
          OUT_FOR_DELIVERY: '{{unsafe.secret}}',
          UNKNOWN: '{{storeName}}',
          CANCELLED: '  Pedido {{orderDisplayId}} cancelado.  ',
        },
      })
    ).toEqual({
      ACCEPTED: '{{storeName}} aceitou o pedido {{orderDisplayId}}',
      CANCELLED: 'Pedido {{orderDisplayId}} cancelado.',
    })
  })
})
