import { CatalogItem } from '@/features/catalog/types'
import { SelectCounter } from '@/services/db/schema'

export type CartItem = CatalogItem & {
  quantity: number
}
export type CartSession = {
  startedAt: Date
  items: CartItem[]
}

export type Counter = SelectCounter
