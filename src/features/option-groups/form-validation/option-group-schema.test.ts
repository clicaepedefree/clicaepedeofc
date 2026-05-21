import { describe, expect, test } from 'bun:test'

import { createOptionGroupSchema } from './option-group-schema'

const validOptionGroup = {
  name: 'Escolha o queijo',
  minQuantity: 0,
  maxQuantity: 1,
  options: [
    {
      itemId: 1,
      price: '0',
      originalPrice: null,
      minQuantity: 0,
      maxQuantity: 1,
      index: 0,
    },
  ],
}

describe('option group schema', () => {
  test('accepts a valid option group', () => {
    expect(createOptionGroupSchema.safeParse(validOptionGroup).success).toBe(true)
  })

  test('requires every option to reference a real item', () => {
    const result = createOptionGroupSchema.safeParse({
      ...validOptionGroup,
      options: [{ ...validOptionGroup.options[0], itemId: 0 }],
    })

    expect(result.success).toBe(false)
  })
})
