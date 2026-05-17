import { describe, expect, test } from 'bun:test'

import { getOrderTypeName } from './order-type'

describe('getOrderTypeName', () => {
  test('returns localized names for known order types', () => {
    expect(getOrderTypeName('DELIVERY')).toBe('Entrega')
    expect(getOrderTypeName('TAKEOUT')).toBe('Retirada')
    expect(getOrderTypeName('INDOOR')).toBe('Consumo local')
  })

  test('falls back to the original value for unknown types', () => {
    expect(getOrderTypeName('CURBSIDE')).toBe('CURBSIDE')
  })
})
