import { CatalogItem } from '@/features/catalog/types'

export type CartItem = CatalogItem & {
  quantity: number
}
export type CartSession = {
  startedAt: Date
  items: CartItem[]
}
