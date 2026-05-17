import { describe, expect, test } from 'bun:test'

import type { IFoodMenuItem } from '@/services/ifood/types'

import type { LocalMenuItem } from './types'
import { autoMatchItems, findSuggestedMatches, validatePDVCode } from './utils'

const localItems: LocalMenuItem[] = [
  {
    id: 10,
    name: 'Pizza Calabresa Grande',
    externalCode: 'PIZ-001',
    ean: null,
    categoryId: 1,
    categoryName: 'Pizzas',
    price: 49.9,
    originalPrice: null,
  },
  {
    id: 11,
    name: 'Refrigerante Cola Lata',
    externalCode: 'REF-001',
    ean: null,
    categoryId: 2,
    categoryName: 'Bebidas',
    price: 7,
    originalPrice: null,
  },
]

const ifoodItems = [
  {
    id: 'ifood-1',
    name: 'Pizza Calabresa',
    externalCode: 'PIZ-001',
  },
  {
    id: 'ifood-2',
    name: 'Suco Natural',
    externalCode: 'SUC-999',
  },
  {
    id: 'ifood-3',
    name: 'Sem codigo',
  },
] as IFoodMenuItem[]

describe('iFood utils', () => {
  test('auto matches items only by external code', () => {
    const result = autoMatchItems(localItems, ifoodItems)

    expect(result.matches).toEqual([
      {
        ifoodItemId: 'ifood-1',
        localItemOfferingId: 10,
        pdvCode: 'PIZ-001',
        matchSource: 'auto_code',
      },
    ])
    expect(result.unmatched.map(item => item.id)).toEqual([
      'ifood-2',
      'ifood-3',
    ])
  })

  test('suggests similar local items by normalized names', () => {
    const suggestions = findSuggestedMatches(
      { id: 'ifood-1', name: 'Pizza de calabresa' } as never,
      localItems,
      1
    )

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].item.id).toBe(10)
    expect(suggestions[0].confidence).toBeGreaterThan(0.6)
  })

  test('validates non-empty PDV codes', () => {
    expect(validatePDVCode(' PIZ-001 ')).toBe(true)
    expect(validatePDVCode('   ')).toBe(false)
  })
})
