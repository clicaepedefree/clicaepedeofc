export type DigitalMenuOption = {
  id: number
  itemId: number
  name: string
  price: string
  originalPrice: string | null
  minQuantity: number
  maxQuantity: number
  index: number
}

export type DigitalMenuOptionGroup = {
  id: number
  name: string
  minQuantity: number
  maxQuantity: number
  options: DigitalMenuOption[]
}

export type DigitalMenuItem = {
  itemOfferingId: number
  itemId: number
  categoryId: number
  name: string
  description: string | null
  imageUrl: string | null
  price: string
  originalPrice: string | null
  inventory: number | null
  externalCode: string | null
  ean: string | null
  optionGroups: DigitalMenuOptionGroup[]
}

export type DigitalMenuCategory = {
  id: number
  name: string
  description: string | null
  imageUrl: string | null
  items: DigitalMenuItem[]
}

export type DigitalMenuStore = {
  id: number
  name: string
  subdomain: string
  status: 'active' | 'inactive' | 'pending_recovery' | 'archived'
  statusReason: string | null
}

export type DigitalMenuData = {
  store: DigitalMenuStore
  categories: DigitalMenuCategory[]
  unavailableReason?: string
}

export type DigitalMenuCartOptionInput = {
  optionId: number
  quantity: number
}

export type DigitalMenuCartItemInput = {
  itemOfferingId: number
  quantity: number
  comment?: string
  options: DigitalMenuCartOptionInput[]
}

export type DigitalMenuSubmitInput = {
  storeSlug: string
  idempotencyKey: string
  customerName: string
  customerPhone: string
  orderType: 'DELIVERY' | 'TAKEOUT'
  address?: {
    street?: string
    number?: string
    neighborhood?: string
    reference?: string
  }
  payment: {
    method: 'CASH' | 'PIX'
    changeFor?: string
  }
  items: DigitalMenuCartItemInput[]
}

export type ValidatedDigitalMenuOption = {
  optionId: number
  itemId: number
  optionGroupId: number
  optionGroupName: string
  optionName: string
  price: string
  quantity: number
  index: number
}

export type ValidatedDigitalMenuCartItem = {
  itemOfferingId: number
  itemId: number
  categoryId: number
  itemName: string
  categoryName: string
  price: string
  originalPrice: string | null
  quantity: number
  externalCode: string | null
  ean: string | null
  comment: string | null
  options: ValidatedDigitalMenuOption[]
  lineTotal: string
  index: number
}

export type ValidatedDigitalMenuCart = {
  items: ValidatedDigitalMenuCartItem[]
  subtotal: string
  deliveryFee: string
  total: string
}

export type DigitalMenuSubmissionResult =
  | {
      ok: true
      publicOrderId: string
      requestId: string
      status: string
      total: string
      reused: boolean
    }
  | {
      ok: false
      message: string
      fieldErrors?: Record<string, string>
      affectedItemOfferingId?: number
    }
