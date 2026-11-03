import { normalizeBenefitPhone } from './ledger-policy'

export type ProductRewardState =
  | 'available'
  | 'pending'
  | 'suspended'
  | 'reversed'
  | 'expired'
  | 'reserved'
  | 'consumed'

export type ProductRewardAvailability =
  | 'available'
  | 'deleted'
  | 'out_of_stock'
  | 'unavailable'

export class ProductRewardError extends Error {
  readonly code = 'PRODUCT_REWARD_UNAVAILABLE'
  constructor() {
    super('Este premio nao esta disponivel para este pedido.')
    this.name = 'ProductRewardError'
  }
}

export const productRewardVoucherCode = (grantId: string) => `FID-${grantId}`

export function productRewardIdentity(storeId: number, phone: string) {
  const canonical = normalizeBenefitPhone(phone)
  if (
    !Number.isSafeInteger(storeId) ||
    storeId <= 0 ||
    storeId > 2147483647 ||
    !canonical
  )
    throw new ProductRewardError()
  return canonical
}

export function productRewardState(
  grant: {
    state: 'pending' | 'confirmed' | 'reversed'
    confirmedAt: Date | null
    expiresAt: Date | null
  },
  active: { state: 'reserved' | 'completed' | 'refunded' } | undefined,
  at: Date
): ProductRewardState {
  // An already allocated item remains allocated even if its origin is later
  // suspended or its validity elapses. Only cancellation returns that right.
  if (active?.state === 'completed') return 'consumed'
  if (active?.state === 'reserved') return 'reserved'
  if (grant.state === 'reversed') return 'reversed'
  if (!grant.confirmedAt || !grant.expiresAt) return 'pending'
  if (grant.expiresAt <= at) return 'expired'
  if (grant.state !== 'confirmed') return 'suspended'
  return 'available'
}

export function productRewardAvailability(
  item: { inventory: number | null } | undefined,
  hasPlainOffering: boolean
): ProductRewardAvailability {
  if (!item) return 'deleted'
  if (item.inventory !== null && item.inventory < 1) return 'out_of_stock'
  return hasPlainOffering ? 'available' : 'unavailable'
}
