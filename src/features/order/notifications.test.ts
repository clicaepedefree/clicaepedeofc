import { describe, expect, test } from 'bun:test'
import { buildNewOrderNotification } from './notifications'

describe('store order notifications', () => {
  test('builds a readable new digital order notification', () => {
    const notification = buildNewOrderNotification({
      id: 7,
      displayId: '42',
      customerName: 'Bruno',
      type: 'DELIVERY',
      totalPrice: '35.5',
    })

    expect({
      ...notification,
      body: notification.body.replace(/\s/g, ' '),
    }).toEqual({
      title: 'Novo pedido digital #42',
      body: 'Bruno - Entrega - R$ 35,50',
      tag: 'digital-order-7',
    })
  })

  test('falls back when optional customer information is missing', () => {
    expect(
      buildNewOrderNotification({
        id: 8,
        displayId: '43',
        customerName: '',
        type: 'TAKEOUT',
      })
    ).toEqual({
      title: 'Novo pedido digital #43',
      body: 'Cliente nao informado - Retirada',
      tag: 'digital-order-8',
    })
  })
})
