import { describe, expect, test } from 'bun:test'
import { quoteDigitalMenuPromotion } from './promotions'

const basePromotion = {
  id: 1,
  code: 'PROMO',
  name: 'Promo teste',
  description: null,
  startsAt: null,
  endsAt: null,
  minOrderAmount: null,
  discountAmount: null,
  discountPercent: null,
  maxDiscountAmount: null,
  freeDeliveryMinimum: null,
  usageLimit: null,
  usedCount: 0,
  perCustomerLimit: null,
  priority: 0,
  isFeatured: false,
  itemOfferingIds: [],
  metadata: null,
}

describe('quoteDigitalMenuPromotion', () => {
  test('aplica cupom de valor fixo sem deixar total negativo', () => {
    const quote = quoteDigitalMenuPromotion({
      promotions: [
        { ...basePromotion, type: 'FIXED_AMOUNT', discountAmount: '15.0000' },
      ],
      couponCode: 'promo',
      subtotal: '40.0000',
      deliveryFee: '5.0000',
      cartItemOfferingIds: [10],
    })

    expect(quote.error).toBe(null)
    expect(quote.discountAmount).toBe('15.0000')
    expect(quote.total).toBe('30.0000')
  })

  test('aplica cupom percentual respeitando teto', () => {
    const quote = quoteDigitalMenuPromotion({
      promotions: [
        {
          ...basePromotion,
          type: 'PERCENTAGE',
          discountPercent: 50,
          maxDiscountAmount: '12.0000',
        },
      ],
      couponCode: 'PROMO',
      subtotal: '80.0000',
      deliveryFee: '7.0000',
      cartItemOfferingIds: [10],
    })

    expect(quote.discountAmount).toBe('12.0000')
    expect(quote.total).toBe('75.0000')
  })

  test('aplica cupom de frete gratis sem conflitar com subtotal', () => {
    const quote = quoteDigitalMenuPromotion({
      promotions: [{ ...basePromotion, type: 'FREE_DELIVERY' }],
      couponCode: 'PROMO',
      subtotal: '30.0000',
      deliveryFee: '8.0000',
      cartItemOfferingIds: [10],
    })

    expect(quote.deliveryDiscountAmount).toBe('8.0000')
    expect(quote.deliveryFee).toBe('0.0000')
    expect(quote.total).toBe('30.0000')
  })

  test('recusa cupom abaixo do pedido minimo', () => {
    const quote = quoteDigitalMenuPromotion({
      promotions: [
        {
          ...basePromotion,
          type: 'FIXED_AMOUNT',
          discountAmount: '10.0000',
          minOrderAmount: '50.0000',
        },
      ],
      couponCode: 'PROMO',
      subtotal: '30.0000',
      deliveryFee: '8.0000',
      cartItemOfferingIds: [10],
    })

    expect(quote.error?.includes('pedido minimo')).toBe(true)
    expect(quote.discountAmount).toBe('0.0000')
    expect(quote.total).toBe('38.0000')
  })

  test('ignora campanha esgotada e nao aplica cupom', () => {
    const quote = quoteDigitalMenuPromotion({
      promotions: [
        {
          ...basePromotion,
          type: 'FIXED_AMOUNT',
          discountAmount: '10.0000',
          usageLimit: 3,
          usedCount: 3,
        },
      ],
      couponCode: 'PROMO',
      subtotal: '60.0000',
      deliveryFee: '8.0000',
      cartItemOfferingIds: [10],
    })

    expect(quote.error).toBe('Cupom invalido, expirado ou esgotado.')
    expect(quote.total).toBe('68.0000')
  })

  test('aplica campanha de frete gratis acima do valor minimo sem cupom', () => {
    const quote = quoteDigitalMenuPromotion({
      promotions: [
        {
          ...basePromotion,
          code: null,
          type: 'FREE_DELIVERY_THRESHOLD',
          freeDeliveryMinimum: '70.0000',
        },
      ],
      subtotal: '75.0000',
      deliveryFee: '9.0000',
      cartItemOfferingIds: [10],
    })

    expect(quote.deliveryDiscountAmount).toBe('9.0000')
    expect(quote.total).toBe('75.0000')
  })

  test('nao aplica frete gratis em retirada ou quando a taxa ja e zero', () => {
    const quote = quoteDigitalMenuPromotion({
      promotions: [{ ...basePromotion, type: 'FREE_DELIVERY' }],
      couponCode: 'PROMO',
      subtotal: '35.0000',
      deliveryFee: '0.0000',
      cartItemOfferingIds: [10],
      allowDeliveryPromotions: false,
    })

    expect(quote.error).toBe('Este cupom vale apenas para pedidos com entrega.')
    expect(quote.deliveryDiscountAmount).toBe('0.0000')
    expect(quote.total).toBe('35.0000')
  })
})
