import { describe, expect, test } from 'bun:test'

import { getPaymentMethodName } from './payment-method'

describe('getPaymentMethodName', () => {
  test('returns localized names for known payment methods', () => {
    expect(getPaymentMethodName('CASH')).toBe('Dinheiro')
    expect(getPaymentMethodName('DEBIT')).toBe('Cartão de débito')
    expect(getPaymentMethodName('CREDIT')).toBe('Cartão de crédito')
    expect(getPaymentMethodName('PIX')).toBe('PIX')
    expect(getPaymentMethodName('ONLINE')).toBe('Pagamento online')
  })

  test('falls back to the original value for unknown methods', () => {
    expect(getPaymentMethodName('GIFT_CARD')).toBe('GIFT_CARD')
  })
})
