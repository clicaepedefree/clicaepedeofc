import { describe, expect, test } from 'bun:test'
import { submitDigitalMenuOrderSchema } from './validation'

const basePayload = {
  storeSlug: 'loja-teste',
  idempotencyKey: 'request-123456789',
  customerName: 'Cliente Teste',
  customerPhone: '11999999999',
  orderType: 'TAKEOUT',
  payment: {
    method: 'PIX',
  },
  items: [
    {
      itemOfferingId: 1,
      quantity: 1,
      options: [],
    },
  ],
}

describe('submitDigitalMenuOrderSchema', () => {
  test('aceita os metodos de pagamento do cardapio digital', () => {
    const methods = [
      'CASH',
      'PIX',
      'CREDIT',
      'DEBIT',
      'MEAL_VOUCHER',
      'FOOD_VOUCHER',
      'ONLINE',
    ]

    for (const method of methods) {
      const result = submitDigitalMenuOrderSchema.safeParse({
        ...basePayload,
        payment: { method },
      })

      expect(result.success).toBe(true)
    }
  })

  test('exige endereco quando pedido e entrega', () => {
    const result = submitDigitalMenuOrderSchema.safeParse({
      ...basePayload,
      orderType: 'DELIVERY',
    })

    expect(result.success).toBe(false)
  })

  test('normaliza dados publicos sensiveis do cliente', () => {
    const result = submitDigitalMenuOrderSchema.safeParse({
      ...basePayload,
      customerName: '  <Bruno>  ',
      customerPhone: '(11) 99999-9999',
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.customerName).toBe('Bruno')
    expect(result.data.customerPhone).toBe('11999999999')
  })
})
