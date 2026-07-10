import { describe, expect, test } from 'bun:test'
import {
  buildDigitalMenuDraftStorageKey,
  parseDigitalMenuDraft,
  shouldPersistDigitalMenuDraft,
} from './draft-storage'

const draft = {
  version: 1,
  cart: [
    {
      cartId: 'cart-1',
      itemOfferingId: 10,
      name: 'Burger',
      price: '25.00',
      quantity: 2,
      comment: 'sem cebola',
      options: [
        {
          optionId: 1,
          optionName: 'Cheddar',
          optionGroupName: 'Adicionais',
          price: '3.00',
          quantity: 1,
        },
      ],
    },
  ],
  customerName: 'Cliente Teste',
  customerPhone: '11999999999',
  customerDocument: '',
  orderNotes: '',
  postalCode: '01001000',
  street: 'Praca da Se',
  number: '100',
  neighborhood: 'Se',
  complement: '',
  reference: '',
  termsAccepted: true,
  orderType: 'DELIVERY',
  scheduledFor: '',
  paymentMethod: 'PIX',
  needsChange: false,
  changeFor: '',
  couponCode: 'PRIMEIRA10',
  appliedCouponCode: 'PRIMEIRA10',
}

describe('digital menu draft storage', () => {
  test('builds a store-scoped storage key', () => {
    expect(buildDigitalMenuDraftStorageKey('loja-teste')).toBe(
      'clica-digital-menu-draft:loja-teste'
    )
  })

  test('restores a valid mobile checkout draft', () => {
    const result = parseDigitalMenuDraft(JSON.stringify(draft))

    expect(result?.cart).toHaveLength(1)
    expect(result?.cart[0]?.options).toHaveLength(1)
    expect(result?.customerName).toBe('Cliente Teste')
    expect(result?.orderType).toBe('DELIVERY')
    expect(result?.paymentMethod).toBe('PIX')
  })

  test('ignores malformed or unsafe drafts', () => {
    expect(parseDigitalMenuDraft('{broken')).toBe(null)
    expect(
      parseDigitalMenuDraft(JSON.stringify({ ...draft, version: 2 }))
    ).toBe(null)
    expect(
      parseDigitalMenuDraft(
        JSON.stringify({
          ...draft,
          cart: [{ ...draft.cart[0], quantity: 0 }],
        })
      )
    ).toBe(null)
  })

  test('keeps drafts only when cart or customer fields have useful content', () => {
    expect(shouldPersistDigitalMenuDraft(draft)).toBe(true)
    expect(
      shouldPersistDigitalMenuDraft({
        ...draft,
        cart: [],
        customerName: '',
        customerPhone: '',
        customerDocument: '',
        orderNotes: '',
        postalCode: '',
        street: '',
        number: '',
        neighborhood: '',
        complement: '',
        reference: '',
        couponCode: '',
        appliedCouponCode: null,
      })
    ).toBe(false)
  })
})
