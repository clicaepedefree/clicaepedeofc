import { describe, expect, test } from 'bun:test'

import {
  formatValueToCurrency,
  getValueFromCurrencyString,
} from './currency'

describe('currency formatter', () => {
  test('parses empty and numeric values', () => {
    expect(getValueFromCurrencyString('')).toBe(0)
    expect(getValueFromCurrencyString(12.5)).toBe(12.5)
  })

  test('parses decimal separator used by the UI', () => {
    expect(getValueFromCurrencyString('12,50')).toBe(12.5)
  })

  test('formats values with and without currency symbol', () => {
    expect(formatValueToCurrency({ value: 12.5 })).toBe('12.50')
    expect(
      formatValueToCurrency({ value: 12.5, includeCurrencySymbol: true })
    ).toBe('R$12,50')
  })

  test('keeps zero as a valid formatted value', () => {
    expect(formatValueToCurrency({ value: 0 })).toBe('0.00')
  })
})
