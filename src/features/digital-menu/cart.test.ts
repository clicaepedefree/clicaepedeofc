import { describe, expect, test } from 'bun:test'
import { validateAndPriceDigitalMenuCart } from './cart'
import { DigitalMenuCategory } from './types'

const categories: DigitalMenuCategory[] = [
  {
    id: 1,
    name: 'Lanches',
    description: null,
    imageUrl: null,
    items: [
      {
        itemOfferingId: 10,
        itemId: 100,
        categoryId: 1,
        name: 'Burger',
        description: null,
        imageUrl: null,
        price: '20.0000',
        originalPrice: null,
        inventory: 5,
        externalCode: null,
        ean: null,
        optionGroups: [
          {
            id: 30,
            name: 'Queijo',
            minQuantity: 1,
            maxQuantity: 2,
            options: [
              {
                id: 40,
                itemId: 200,
                name: 'Cheddar',
                price: '3.0000',
                originalPrice: null,
                minQuantity: 1,
                maxQuantity: 1,
                index: 1,
              },
              {
                id: 41,
                itemId: 201,
                name: 'Prato',
                price: '2.5000',
                originalPrice: null,
                minQuantity: 1,
                maxQuantity: 1,
                index: 2,
              },
            ],
          },
        ],
      },
    ],
  },
]

describe('validateAndPriceDigitalMenuCart', () => {
  test('recalcula total usando preco e adicionais do catalogo do servidor', () => {
    const cart = validateAndPriceDigitalMenuCart({
      categories,
      deliveryFee: '4.0000',
      items: [
        {
          itemOfferingId: 10,
          quantity: 2,
          options: [{ optionId: 40, quantity: 1 }],
        },
      ],
    })

    expect(cart.subtotal).toBe('46.0000')
    expect(cart.deliveryFee).toBe('4.0000')
    expect(cart.total).toBe('50.0000')
    expect(cart.items[0].options[0].optionName).toBe('Cheddar')
  })

  test('bloqueia item que nao existe no catalogo publico', () => {
    let message = ''

    try {
      validateAndPriceDigitalMenuCart({
        categories,
        items: [{ itemOfferingId: 999, quantity: 1, options: [] }],
      })
    } catch (error) {
      message = error instanceof Error ? error.message : ''
    }

    expect(message).toBe('Um dos itens do carrinho nao esta mais disponivel.')
  })

  test('preserva taxa, pedido minimo e zona de entrega validados no backend', () => {
    const cart = validateAndPriceDigitalMenuCart({
      categories,
      deliveryFee: '7.5000',
      minimumOrderAmount: '35.0000',
      deliveryZoneId: 12,
      deliveryEstimatedMinutes: 45,
      items: [
        {
          itemOfferingId: 10,
          quantity: 2,
          options: [{ optionId: 40, quantity: 1 }],
        },
      ],
    })

    expect(cart.subtotal).toBe('46.0000')
    expect(cart.deliveryFee).toBe('7.5000')
    expect(cart.total).toBe('53.5000')
    expect(cart.minimumOrderAmount).toBe('35.0000')
    expect(cart.deliveryZoneId).toBe(12)
    expect(cart.deliveryEstimatedMinutes).toBe(45)
  })

  test('bloqueia grupo obrigatorio sem opcao selecionada', () => {
    let message = ''

    try {
      validateAndPriceDigitalMenuCart({
        categories,
        items: [{ itemOfferingId: 10, quantity: 1, options: [] }],
      })
    } catch (error) {
      message = error instanceof Error ? error.message : ''
    }

    expect(message).toBe('Burger: escolha entre 1 e 2 opcoes em Queijo.')
  })
})
