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

export type DigitalMenuSettings = {
  whatsappPhone: string | null
  isDigitalMenuEnabled: boolean
  isAcceptingOrders: boolean
  operationalStatus: 'OPEN' | 'CLOSED' | 'PAUSED' | 'TAKEOUT_ONLY' | 'DELIVERY_ONLY'
  operationalStatusMessage: string | null
  manualPauseReason: string | null
  minimumOrderAmount: string
  averagePreparationMinutes: number
  allowScheduledOrders: boolean
  scheduleMinLeadMinutes: number
  scheduleMaxDaysAhead: number
}

export type DigitalMenuAvailability = {
  isOpen: boolean
  reason: string | null
  nextOpeningLabel: string | null
  canSchedule: boolean
  statusLabel: string
}

export type DigitalMenuAvailabilities = {
  delivery: DigitalMenuAvailability
  takeout: DigitalMenuAvailability
}

export type DigitalMenuPaymentMethod = {
  method:
    | 'CASH'
    | 'PIX'
    | 'CREDIT'
    | 'DEBIT'
    | 'MEAL_VOUCHER'
    | 'FOOD_VOUCHER'
    | 'ONLINE'
  label: string
  instructions: string | null
  proofInstructions: string | null
  pixKey: string | null
  integrationProvider: string | null
  requiresChangeFor: boolean
  availableFor: ('DELIVERY' | 'TAKEOUT')[]
}

export type DigitalMenuDeliveryZone = {
  id: number
  type: 'FIXED' | 'NEIGHBORHOOD' | 'RADIUS' | 'POSTAL_CODE'
  name: string
  neighborhood: string | null
  postalCodePrefix: string | null
  centerLat: string | null
  centerLng: string | null
  radiusMeters: number | null
  deliveryFee: string
  freeDeliveryMinimum: string | null
  minimumOrderAmount: string | null
  estimatedDeliveryMinutes: number
  priority: number
  isActive: boolean
}

export type DigitalMenuData = {
  store: DigitalMenuStore
  settings: DigitalMenuSettings
  availability: DigitalMenuAvailability
  availabilities: DigitalMenuAvailabilities
  paymentMethods: DigitalMenuPaymentMethod[]
  deliveryZones: DigitalMenuDeliveryZone[]
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
  scheduledFor?: string
  address?: {
    postalCode?: string
    street?: string
    number?: string
    neighborhood?: string
    reference?: string
    latitude?: number
    longitude?: number
  }
  payment: {
    method:
      | 'CASH'
      | 'PIX'
      | 'CREDIT'
      | 'DEBIT'
      | 'MEAL_VOUCHER'
      | 'FOOD_VOUCHER'
      | 'ONLINE'
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
  minimumOrderAmount: string
  deliveryZoneId: number | null
  deliveryEstimatedMinutes: number | null
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
