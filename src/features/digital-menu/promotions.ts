import Decimal from 'decimal.js'
import type { SelectDigitalMenuPromotion } from '@/services/db/schema'

export type DigitalMenuPromotionType =
  | 'FIXED_AMOUNT'
  | 'PERCENTAGE'
  | 'FREE_DELIVERY'
  | 'FREE_DELIVERY_THRESHOLD'
  | 'FEATURED_ITEM'
  | 'COMBO'
  | 'ITEM_PRICE'

export type PublicDigitalMenuPromotion = {
  id: number
  code: string | null
  name: string
  description: string | null
  type: DigitalMenuPromotionType
  startsAt: Date | null
  endsAt: Date | null
  minOrderAmount: string | null
  discountAmount: string | null
  discountPercent: number | null
  maxDiscountAmount: string | null
  freeDeliveryMinimum: string | null
  usageLimit: number | null
  usedCount: number
  perCustomerLimit: number | null
  priority: number
  isFeatured: boolean
  itemOfferingIds: number[]
  metadata: unknown
}

export type AppliedDigitalMenuPromotion = {
  promotionId: number
  code: string | null
  name: string
  type: DigitalMenuPromotionType
  discountAmount: string
  deliveryDiscountAmount: string
  message: string
}

export type DigitalMenuPromotionQuote = {
  subtotal: string
  deliveryFeeBeforeDiscount: string
  deliveryFee: string
  discountAmount: string
  deliveryDiscountAmount: string
  total: string
  appliedPromotion: AppliedDigitalMenuPromotion | null
  error: string | null
}

const toMoney = (value: Decimal.Value) => new Decimal(value).toFixed(4)

export const normalizeCouponCode = (value: string | null | undefined) => {
  const normalized = value?.trim().toUpperCase().replace(/\s+/g, '') ?? ''
  return normalized || null
}

const isPromotionActiveNow = (
  promotion: Pick<PublicDigitalMenuPromotion, 'startsAt' | 'endsAt'>,
  now: Date
) => {
  if (promotion.startsAt && promotion.startsAt > now) return false
  if (promotion.endsAt && promotion.endsAt < now) return false
  return true
}

const isUsageAvailable = (
  promotion: Pick<PublicDigitalMenuPromotion, 'usageLimit' | 'usedCount'>
) => {
  if (!promotion.usageLimit) return true
  return promotion.usedCount < promotion.usageLimit
}

const hasEligibleItems = (
  promotion: Pick<PublicDigitalMenuPromotion, 'itemOfferingIds'>,
  cartItemOfferingIds: number[]
) => {
  if (promotion.itemOfferingIds.length === 0) return true
  return cartItemOfferingIds.some(itemOfferingId =>
    promotion.itemOfferingIds.includes(itemOfferingId)
  )
}

export const mapDbPromotionToPublic = (
  promotion: SelectDigitalMenuPromotion,
  itemOfferingIds: number[] = []
): PublicDigitalMenuPromotion => ({
  id: promotion.id,
  code: promotion.code,
  name: promotion.name,
  description: promotion.description,
  type: promotion.type as DigitalMenuPromotionType,
  startsAt: promotion.startsAt,
  endsAt: promotion.endsAt,
  minOrderAmount: promotion.minOrderAmount,
  discountAmount: promotion.discountAmount,
  discountPercent: promotion.discountPercent,
  maxDiscountAmount: promotion.maxDiscountAmount,
  freeDeliveryMinimum: promotion.freeDeliveryMinimum,
  usageLimit: promotion.usageLimit,
  usedCount: promotion.usedCount,
  perCustomerLimit: promotion.perCustomerLimit,
  priority: promotion.priority,
  isFeatured: promotion.isFeatured,
  itemOfferingIds,
  metadata: promotion.metadata,
})

export const quoteDigitalMenuPromotion = ({
  promotions,
  couponCode,
  subtotal,
  deliveryFee,
  cartItemOfferingIds,
  allowDeliveryPromotions = true,
  now = new Date(),
}: {
  promotions: PublicDigitalMenuPromotion[]
  couponCode?: string | null
  subtotal: string
  deliveryFee: string
  cartItemOfferingIds: number[]
  allowDeliveryPromotions?: boolean
  now?: Date
}): DigitalMenuPromotionQuote => {
  const subtotalValue = new Decimal(subtotal)
  const deliveryFeeBeforeDiscount = new Decimal(deliveryFee)
  const normalizedCouponCode = normalizeCouponCode(couponCode)
  const activePromotions = promotions
    .filter(promotion => isPromotionActiveNow(promotion, now))
    .filter(isUsageAvailable)
    .filter(promotion => hasEligibleItems(promotion, cartItemOfferingIds))
    .sort((first, second) => second.priority - first.priority)

  const freeDeliveryCampaign = activePromotions.find(
    promotion =>
      allowDeliveryPromotions &&
      deliveryFeeBeforeDiscount.greaterThan(0) &&
      promotion.type === 'FREE_DELIVERY_THRESHOLD' &&
      promotion.freeDeliveryMinimum &&
      subtotalValue.greaterThanOrEqualTo(promotion.freeDeliveryMinimum)
  )

  let coupon: PublicDigitalMenuPromotion | undefined
  if (normalizedCouponCode) {
    coupon = activePromotions.find(
      promotion =>
        promotion.code?.toUpperCase() === normalizedCouponCode &&
        ['FIXED_AMOUNT', 'PERCENTAGE', 'FREE_DELIVERY'].includes(promotion.type)
    )

    if (!coupon) {
      return {
        subtotal: toMoney(subtotalValue),
        deliveryFeeBeforeDiscount: toMoney(deliveryFeeBeforeDiscount),
        deliveryFee: toMoney(deliveryFeeBeforeDiscount),
        discountAmount: '0.0000',
        deliveryDiscountAmount: '0.0000',
        total: toMoney(subtotalValue.plus(deliveryFeeBeforeDiscount)),
        appliedPromotion: null,
        error: 'Cupom invalido, expirado ou esgotado.',
      }
    }

    if (
      coupon.minOrderAmount &&
      subtotalValue.lessThan(coupon.minOrderAmount)
    ) {
      return {
        subtotal: toMoney(subtotalValue),
        deliveryFeeBeforeDiscount: toMoney(deliveryFeeBeforeDiscount),
        deliveryFee: toMoney(deliveryFeeBeforeDiscount),
        discountAmount: '0.0000',
        deliveryDiscountAmount: '0.0000',
        total: toMoney(subtotalValue.plus(deliveryFeeBeforeDiscount)),
        appliedPromotion: null,
        error: `Este cupom exige pedido minimo de R$ ${new Decimal(coupon.minOrderAmount).toFixed(2).replace('.', ',')}.`,
      }
    }
  }

  let discountAmount = new Decimal(0)
  let deliveryDiscountAmount = new Decimal(0)
  let appliedPromotion: AppliedDigitalMenuPromotion | null = null

  if (coupon) {
    if (coupon.type === 'FIXED_AMOUNT') {
      discountAmount = Decimal.min(
        subtotalValue,
        new Decimal(coupon.discountAmount ?? 0)
      )
    }

    if (coupon.type === 'PERCENTAGE') {
      discountAmount = subtotalValue
        .times(coupon.discountPercent ?? 0)
        .dividedBy(100)
      if (coupon.maxDiscountAmount) {
        discountAmount = Decimal.min(
          discountAmount,
          new Decimal(coupon.maxDiscountAmount)
        )
      }
      discountAmount = Decimal.min(discountAmount, subtotalValue)
    }

    if (coupon.type === 'FREE_DELIVERY') {
      if (
        !allowDeliveryPromotions ||
        deliveryFeeBeforeDiscount.lessThanOrEqualTo(0)
      ) {
        return {
          subtotal: toMoney(subtotalValue),
          deliveryFeeBeforeDiscount: toMoney(deliveryFeeBeforeDiscount),
          deliveryFee: toMoney(deliveryFeeBeforeDiscount),
          discountAmount: '0.0000',
          deliveryDiscountAmount: '0.0000',
          total: toMoney(subtotalValue.plus(deliveryFeeBeforeDiscount)),
          appliedPromotion: null,
          error: 'Este cupom vale apenas para pedidos com entrega.',
        }
      }
      deliveryDiscountAmount = deliveryFeeBeforeDiscount
    }

    appliedPromotion = {
      promotionId: coupon.id,
      code: coupon.code,
      name: coupon.name,
      type: coupon.type,
      discountAmount: toMoney(discountAmount),
      deliveryDiscountAmount: toMoney(deliveryDiscountAmount),
      message: `${coupon.name} aplicado.`,
    }
  }

  if (!coupon && freeDeliveryCampaign) {
    deliveryDiscountAmount = deliveryFeeBeforeDiscount
    appliedPromotion = {
      promotionId: freeDeliveryCampaign.id,
      code: freeDeliveryCampaign.code,
      name: freeDeliveryCampaign.name,
      type: freeDeliveryCampaign.type,
      discountAmount: '0.0000',
      deliveryDiscountAmount: toMoney(deliveryDiscountAmount),
      message: `${freeDeliveryCampaign.name} aplicado.`,
    }
  }

  const deliveryFeeAfterDiscount = Decimal.max(
    0,
    deliveryFeeBeforeDiscount.minus(deliveryDiscountAmount)
  )
  const total = Decimal.max(
    0,
    subtotalValue.minus(discountAmount).plus(deliveryFeeAfterDiscount)
  )

  return {
    subtotal: toMoney(subtotalValue),
    deliveryFeeBeforeDiscount: toMoney(deliveryFeeBeforeDiscount),
    deliveryFee: toMoney(deliveryFeeAfterDiscount),
    discountAmount: toMoney(discountAmount),
    deliveryDiscountAmount: toMoney(deliveryDiscountAmount),
    total: toMoney(total),
    appliedPromotion,
    error: null,
  }
}
