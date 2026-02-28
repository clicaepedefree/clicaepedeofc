// OAuth token response from iFood API
export interface TokenResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number // Seconds until token expires
  merchantId: string // iFood merchant UUID
}

// Catalog info returned by getMerchantCatalogs()
export interface IFoodCatalog {
  id: string
  name: string
  status: string
  type: string
}

// Normalized menu structure returned by getMerchantMenu()
export interface IFoodMenu {
  categories: IFoodCategory[]
}

// Category with its items (built by grouping items by categoryId)
export interface IFoodCategory {
  id: string // categoryId from API
  name: string // categoryName from API
  index: number // categoryIndex from API
  items: IFoodMenuItem[]
}

// Menu item (normalized from API response)
export interface IFoodMenuItem {
  id: string // itemId from API
  categoryId: string
  externalCode: string | null // itemExternalCode (PDV code)
  name: string // itemName
  description: string | null // itemDescription
  price: {
    value: number
    originalValue: number | null
  }
  index: number // itemIndex
}

// Raw API response types (internal use only)

export interface IFoodAPITokenResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
  type: string
}

export interface IFoodAPIItemPrice {
  value: number
  originalValue?: number
}

export interface IFoodAPIItemSchedule {
  dayOfWeek: string
  beginHour: string
  endHour: string
}

export interface IFoodAPIItemOption {
  optionId: string
  name: string
  externalCode?: string
  description?: string
  logosUrls: string[]
  quantity: number
  price: IFoodAPIItemPrice
}

export interface IFoodAPIItemOptionGroup {
  optionGroupId: string
  name: string
  minQuantity: number
  maxQuantity: number
  optionGroupIndex: number
  options: IFoodAPIItemOption[]
}

export interface IFoodAPIProductTag {
  group: string
  tags: string[]
}

export interface IFoodAPIItemSellingOption {
  minimum: number
  incremental: number
  availableUnits: string[]
}

export interface IFoodAPIItemResponse {
  itemId: string
  categoryId: string
  itemExternalCode?: string
  categoryName: string
  categoryIndex: number
  itemName: string
  itemDescription?: string
  logosUrls: string[]
  itemIndex: number
  itemPrice: IFoodAPIItemPrice
  itemMinSalePrice: number
  itemSchedules: IFoodAPIItemSchedule[]
  itemQuantity?: number
  itemUnit?: string
  itemPackaging?: string
  itemOptionGroups: IFoodAPIItemOptionGroup[]
  itemGeneralTags: string[]
  itemProductTags: IFoodAPIProductTag[]
  itemSellingOption?: IFoodAPIItemSellingOption
}

// The catalog response is a flat array of items
export type IFoodAPICatalogResponse = IFoodAPIItemResponse[]
