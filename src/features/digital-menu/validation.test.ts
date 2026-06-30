import { describe, expect, test } from 'bun:test'
import { submitDigitalMenuOrderSchema } from './validation'

const basePayload = {
  storeSlug: 'loja-teste',
  idempotencyKey: 'request-123456789',
  customerName: 'Cliente Teste',
  customerPhone: '11999999999',
  termsAccepted: true,
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

  test('exige cada campo obrigatorio do endereco de entrega', () => {
    const address = {
      postalCode: '01001-000',
      street: 'Praca da Se',
      number: '100',
      neighborhood: 'Se',
    }

    for (const field of Object.keys(address)) {
      const result = submitDigitalMenuOrderSchema.safeParse({
        ...basePayload,
        orderType: 'DELIVERY',
        address: { ...address, [field]: '' },
      })

      expect(result.success).toBe(false)
    }
  })

  test('aceita complemento e observacao geral sanitizados', () => {
    const result = submitDigitalMenuOrderSchema.safeParse({
      ...basePayload,
      orderNotes: '  <sem cebola>  ',
      orderType: 'DELIVERY',
      address: {
        postalCode: '01001-000',
        street: 'Praca da Se',
        number: '100',
        neighborhood: 'Se',
        complement: ' <apto 12> ',
      },
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.orderNotes).toBe('sem cebola')
    expect(result.data.address?.complement).toBe('apto 12')
  })

  test('valida CPF apenas quando informado', () => {
    expect(
      submitDigitalMenuOrderSchema.safeParse({
        ...basePayload,
        customerDocument: '529.982.247-25',
      }).success
    ).toBe(true)

    expect(
      submitDigitalMenuOrderSchema.safeParse({
        ...basePayload,
        customerDocument: '111.111.111-11',
      }).success
    ).toBe(false)
  })

  test('exige aceite explicito antes de criar o pedido', () => {
    const result = submitDigitalMenuOrderSchema.safeParse({
      ...basePayload,
      termsAccepted: false,
    })

    expect(result.success).toBe(false)
  })

  test('rejeita nome composto apenas por espacos', () => {
    const result = submitDigitalMenuOrderSchema.safeParse({
      ...basePayload,
      customerName: '   ',
    })

    expect(result.success).toBe(false)
  })

  test('rejeita CEP de entrega incompleto', () => {
    const result = submitDigitalMenuOrderSchema.safeParse({
      ...basePayload,
      orderType: 'DELIVERY',
      address: {
        postalCode: '1',
        street: 'Praca da Se',
        number: '100',
        neighborhood: 'Se',
      },
    })

    expect(result.success).toBe(false)
  })

  test('exige valor quando cliente solicita troco', () => {
    const result = submitDigitalMenuOrderSchema.safeParse({
      ...basePayload,
      payment: {
        method: 'CASH',
        needsChange: true,
        changeFor: '',
      },
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

  test('bloqueia finalizacao com carrinho vazio', () => {
    const result = submitDigitalMenuOrderSchema.safeParse({
      ...basePayload,
      items: [],
    })

    expect(result.success).toBe(false)
  })
})
