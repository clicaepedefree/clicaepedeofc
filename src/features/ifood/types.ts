import type { IFoodMenuItem } from '@/services/ifood/types'

// Local menu item type (from our database)
export interface LocalMenuItem {
  id: number
  name: string
  externalCode: string | null
  ean: string | null
  categoryId: number
  categoryName: string
  price: number
  originalPrice: number | null
}

// Item match result
export interface ItemMatch {
  ifoodItemId: string
  localItemOfferingId: number
  pdvCode: string
  matchSource: 'auto_code' | 'manual'
}

// Suggested match for UI
export interface SuggestedMatch {
  item: LocalMenuItem
  matchType: 'ean' | 'name'
  confidence: number
}
