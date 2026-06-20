import Decimal from 'decimal.js'
import {
  DigitalMenuCartItemInput,
  DigitalMenuCategory,
  DigitalMenuItem,
  DigitalMenuOption,
  DigitalMenuOptionGroup,
  ValidatedDigitalMenuCart,
} from './types'
import { sanitizePublicText } from './validation'

type CatalogLookup = {
  offeringById: Map<number, DigitalMenuItem & { categoryName: string }>
}

export const buildCatalogLookup = (categories: DigitalMenuCategory[]) => {
  const offeringById: CatalogLookup['offeringById'] = new Map()

  for (const category of categories) {
    for (const item of category.items) {
      offeringById.set(item.itemOfferingId, {
        ...item,
        categoryName: category.name,
      })
    }
  }

  return { offeringById }
}

const toMoney = (value: Decimal.Value) => new Decimal(value).toFixed(4)

const getOptionById = (
  optionGroups: DigitalMenuOptionGroup[],
  optionId: number
): (DigitalMenuOption & { optionGroup: DigitalMenuOptionGroup }) | null => {
  for (const optionGroup of optionGroups) {
    const option = optionGroup.options.find(current => current.id === optionId)
    if (option) return { ...option, optionGroup }
  }

  return null
}

export const validateAndPriceDigitalMenuCart = ({
  items,
  categories,
  deliveryFee = '0',
  minimumOrderAmount = '0',
  deliveryZoneId = null,
  deliveryEstimatedMinutes = null,
}: {
  items: DigitalMenuCartItemInput[]
  categories: DigitalMenuCategory[]
  deliveryFee?: string
  minimumOrderAmount?: string
  deliveryZoneId?: number | null
  deliveryEstimatedMinutes?: number | null
}): ValidatedDigitalMenuCart => {
  const { offeringById } = buildCatalogLookup(categories)
  let subtotal = new Decimal(0)

  const validatedItems = items.map((cartItem, itemIndex) => {
    const offering = offeringById.get(cartItem.itemOfferingId)

    if (!offering) {
      throw new Error('Um dos itens do carrinho nao esta mais disponivel.')
    }

    if (offering.inventory !== null && cartItem.quantity > offering.inventory) {
      throw new Error(`${offering.name} nao possui estoque suficiente.`)
    }

    const optionQuantitiesByGroup = new Map<number, number>()
    const selectedOptions = cartItem.options.map((selectedOption, optionIndex) => {
      const option = getOptionById(offering.optionGroups, selectedOption.optionId)

      if (!option) {
        throw new Error(`Um adicional de ${offering.name} nao esta mais disponivel.`)
      }

      if (
        selectedOption.quantity < option.minQuantity ||
        selectedOption.quantity > option.maxQuantity
      ) {
        throw new Error(
          `${option.name} precisa respeitar o limite de ${option.minQuantity} a ${option.maxQuantity}.`
        )
      }

      optionQuantitiesByGroup.set(
        option.optionGroup.id,
        (optionQuantitiesByGroup.get(option.optionGroup.id) ?? 0) +
          selectedOption.quantity
      )

      return {
        optionId: option.id,
        itemId: option.itemId,
        optionGroupId: option.optionGroup.id,
        optionGroupName: option.optionGroup.name,
        optionName: option.name,
        price: toMoney(option.price),
        quantity: selectedOption.quantity,
        index: optionIndex,
      }
    })

    for (const optionGroup of offering.optionGroups) {
      const selectedQuantity = optionQuantitiesByGroup.get(optionGroup.id) ?? 0
      if (
        selectedQuantity < optionGroup.minQuantity ||
        selectedQuantity > optionGroup.maxQuantity
      ) {
        throw new Error(
          `${offering.name}: escolha entre ${optionGroup.minQuantity} e ${optionGroup.maxQuantity} opcoes em ${optionGroup.name}.`
        )
      }
    }

    const optionsTotal = selectedOptions.reduce(
      (total, option) =>
        total.plus(new Decimal(option.price).times(option.quantity)),
      new Decimal(0)
    )
    const unitTotal = new Decimal(offering.price).plus(optionsTotal)
    const lineTotal = unitTotal.times(cartItem.quantity)
    subtotal = subtotal.plus(lineTotal)

    return {
      itemOfferingId: offering.itemOfferingId,
      itemId: offering.itemId,
      categoryId: offering.categoryId,
      itemName: offering.name,
      categoryName: offering.categoryName,
      price: toMoney(offering.price),
      originalPrice: offering.originalPrice ? toMoney(offering.originalPrice) : null,
      quantity: cartItem.quantity,
      externalCode: offering.externalCode,
      ean: offering.ean,
      comment: sanitizePublicText(cartItem.comment, 240) || null,
      options: selectedOptions,
      lineTotal: toMoney(lineTotal),
      index: itemIndex,
    }
  })

  const deliveryFeeAsDecimal = new Decimal(deliveryFee)

  return {
    items: validatedItems,
    subtotal: toMoney(subtotal),
    deliveryFee: toMoney(deliveryFeeAsDecimal),
    minimumOrderAmount: toMoney(minimumOrderAmount),
    deliveryZoneId,
    deliveryEstimatedMinutes,
    total: toMoney(subtotal.plus(deliveryFeeAsDecimal)),
  }
}
