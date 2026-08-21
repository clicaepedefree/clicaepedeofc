import { describe, expect, test } from 'bun:test'
import {
  getBillingIntervalLabel,
  getBillingAccessExemptionLabel,
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
      billingAccessExemptionKind: 'courtesy',
      billingAccessExemptUntil: '2026-10-30T12:00',
      billingAccessExemptionReason: 'Cortesia aprovada pelo financeiro.',
      reason: 'Condicao comercial negociada com a loja.',
    })

    expect(parsed.storeId).toBe(10)
    expect(parsed.subscriptionId).toBe(20)
    expect(parsed.discountValidUntil instanceof Date).toBe(true)
    expect(parsed.paymentGraceDays).toBe(7)
    expect(parsed.billingAccessExemptionKind).toBe('courtesy')
    expect(parsed.billingAccessExemptUntil instanceof Date).toBe(true)
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
      billingAccessExemptionKind: 'none',
      reason: 'Remocao de desconto da loja.',
    })

    expect(result.success).toBe(false)
  })

  test('requires full financial exception data when exemption is active', () => {
    const result = storeSubscriptionTermsSchema.safeParse({
      storeId: 10,
      subscriptionId: 20,
      contractedAmount: '199.90',
      discountType: 'none',
      discountValue: '',
      discountValidUntil: '',
      paymentGraceDays: 5,
      billingAccessExemptionKind: 'manual_exception',
      billingAccessExemptUntil: '',
      billingAccessExemptionReason: '',
      reason: 'Excecao aprovada pelo financeiro.',
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
    expect(
      getBillingAccessExemptionLabel({
        billingAccessExemptionKind: 'manual_exception',
        billingAccessExemptUntil: new Date('2026-10-01T00:00:00.000Z'),
        now: new Date('2026-09-01T00:00:00.000Z'),
      })
    ).toBe('Excecao manual ativa')
  })
})
