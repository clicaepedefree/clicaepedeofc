import { describe, expect, test } from 'bun:test'
import {
  getBillingIntervalLabel,
  getDiscountLabel,
  getExpectedSubscriptionBlockAt,
  storeSubscriptionTermsSchema,
} from './subscription-terms-policy'

describe('internal subscription terms policy', () => {
  test('validates store-specific contract terms without editing plan catalog', () => {
    const parsed = storeSubscriptionTermsSchema.parse({
      storeId: '10',
      subscriptionId: '20',
      contractedAmount: '199,90',
      discountType: 'percentage',
      discountValue: '10',
      discountValidUntil: '2026-09-30T12:00',
      paymentGraceDays: '7',
      reason: 'Condicao comercial negociada com a loja.',
    })

    expect(parsed.storeId).toBe(10)
    expect(parsed.subscriptionId).toBe(20)
    expect(parsed.discountValidUntil instanceof Date).toBe(true)
    expect(parsed.paymentGraceDays).toBe(7)
  })

  test('blocks discount validity without a configured discount', () => {
    const result = storeSubscriptionTermsSchema.safeParse({
      storeId: 10,
      subscriptionId: 20,
      contractedAmount: '199.90',
      discountType: 'none',
      discountValue: '',
      discountValidUntil: '2026-09-30T12:00',
      paymentGraceDays: 0,
      reason: 'Remocao de desconto da loja.',
    })

    expect(result.success).toBe(false)
  })

  test('calculates expected block date from next billing and grace days', () => {
    expect(
      getExpectedSubscriptionBlockAt({
        nextBillingAt: new Date('2026-09-10T00:00:00.000Z'),
        paymentGraceDays: 5,
      })?.toISOString()
    ).toBe('2026-09-15T00:00:00.000Z')
  })

  test('formats interval and discount labels for internal summary', () => {
    expect(
      getBillingIntervalLabel({
        billingInterval: 'monthly',
        billingIntervalCount: 1,
      })
    ).toBe('A cada mes')
    expect(
      getBillingIntervalLabel({
        billingInterval: 'quarterly',
        billingIntervalCount: 2,
      })
    ).toBe('A cada 2 trimestres')
    expect(
      getDiscountLabel({
        discountType: 'percentage',
        discountValue: '12.5',
      })
    ).toBe('12.5%')
    expect(
      getDiscountLabel({
        discountType: 'fixed_amount',
        discountValue: '25.5',
      }).replace(/\s+/g, ' ')
    ).toBe('R$ 25,50')
    expect(
      getDiscountLabel({
        discountType: null,
        discountValue: null,
      })
    ).toBe('Sem desconto')
  })
})
