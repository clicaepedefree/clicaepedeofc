import type { DigitalMenuSubmitInput } from './types'

export type DigitalMenuDraftCartOption = {
  optionId: number
  optionName: string
  optionGroupName: string
  price: string
  quantity: number
}

export type DigitalMenuDraftCartItem = {
  cartId: string
  itemOfferingId: number
  name: string
  price: string
  quantity: number
  comment: string
  options: DigitalMenuDraftCartOption[]
}

export type DigitalMenuDraftState = {
  version: 1
  cart: DigitalMenuDraftCartItem[]
  customerName: string
  customerPhone: string
  customerDocument: string
  orderNotes: string
  postalCode: string
  street: string
  number: string
  neighborhood: string
  complement: string
  reference: string
  termsAccepted: boolean
  orderType: DigitalMenuSubmitInput['orderType']
  scheduledFor: string
  paymentMethod: DigitalMenuSubmitInput['payment']['method']
  needsChange: boolean
  changeFor: string
  couponCode: string
  appliedCouponCode: string | null
}

const paymentMethods = [
  'CASH',
  'PIX',
  'CREDIT',
  'DEBIT',
  'MEAL_VOUCHER',
  'FOOD_VOUCHER',
  'ONLINE',
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isString = (value: unknown): value is string => typeof value === 'string'

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const sanitizeString = (value: unknown) => (isString(value) ? value : '')

const sanitizeBoolean = (value: unknown) =>
  typeof value === 'boolean' ? value : false

const sanitizeOrderType = (
  value: unknown
): DigitalMenuSubmitInput['orderType'] =>
  value === 'TAKEOUT' ? 'TAKEOUT' : 'DELIVERY'

const isPaymentMethod = (
  value: unknown
): value is DigitalMenuSubmitInput['payment']['method'] =>
  paymentMethods.some(method => method === value)

const sanitizePaymentMethod = (
  value: unknown
): DigitalMenuSubmitInput['payment']['method'] =>
  isPaymentMethod(value) ? value : 'PIX'

const isDraftCartOption = (
  value: unknown
): value is DigitalMenuDraftCartOption => {
  if (!isRecord(value)) return false

  return (
    isNumber(value.optionId) &&
    isString(value.optionName) &&
    isString(value.optionGroupName) &&
    isString(value.price) &&
    isNumber(value.quantity) &&
    value.quantity > 0
  )
}

const isDraftCartItem = (value: unknown): value is DigitalMenuDraftCartItem => {
  if (!isRecord(value) || !Array.isArray(value.options)) return false

  return (
    isString(value.cartId) &&
    isNumber(value.itemOfferingId) &&
    isString(value.name) &&
    isString(value.price) &&
    isNumber(value.quantity) &&
    value.quantity > 0 &&
    isString(value.comment) &&
    value.options.every(isDraftCartOption)
  )
}

export const buildDigitalMenuDraftStorageKey = (storeSlug: string) =>
  `clica-digital-menu-draft:${storeSlug}`

export const parseDigitalMenuDraft = (
  raw: string | null
): DigitalMenuDraftState | null => {
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      !isRecord(parsed) ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.cart) ||
      !parsed.cart.every(isDraftCartItem)
    ) {
      return null
    }

    return {
      version: 1,
      cart: parsed.cart,
      customerName: sanitizeString(parsed.customerName),
      customerPhone: sanitizeString(parsed.customerPhone),
      customerDocument: sanitizeString(parsed.customerDocument),
      orderNotes: sanitizeString(parsed.orderNotes),
      postalCode: sanitizeString(parsed.postalCode),
      street: sanitizeString(parsed.street),
      number: sanitizeString(parsed.number),
      neighborhood: sanitizeString(parsed.neighborhood),
      complement: sanitizeString(parsed.complement),
      reference: sanitizeString(parsed.reference),
      termsAccepted: sanitizeBoolean(parsed.termsAccepted),
      orderType: sanitizeOrderType(parsed.orderType),
      scheduledFor: sanitizeString(parsed.scheduledFor),
      paymentMethod: sanitizePaymentMethod(parsed.paymentMethod),
      needsChange: sanitizeBoolean(parsed.needsChange),
      changeFor: sanitizeString(parsed.changeFor),
      couponCode: sanitizeString(parsed.couponCode),
      appliedCouponCode: isString(parsed.appliedCouponCode)
        ? parsed.appliedCouponCode
        : null,
    }
  } catch {
    return null
  }
}

export const shouldPersistDigitalMenuDraft = (
  draft: Pick<
    DigitalMenuDraftState,
    | 'cart'
    | 'customerName'
    | 'customerPhone'
    | 'customerDocument'
    | 'orderNotes'
    | 'postalCode'
    | 'street'
    | 'number'
    | 'neighborhood'
    | 'complement'
    | 'reference'
    | 'couponCode'
    | 'appliedCouponCode'
  >
) =>
  draft.cart.length > 0 ||
  [
    draft.customerName,
    draft.customerPhone,
    draft.customerDocument,
    draft.orderNotes,
    draft.postalCode,
    draft.street,
    draft.number,
    draft.neighborhood,
    draft.complement,
    draft.reference,
    draft.couponCode,
    draft.appliedCouponCode ?? '',
  ].some(value => value.trim().length > 0)
