import { MenuItem } from '@/features/menu/types'
import { SelectCounter } from '@/services/db/schema'

export type CartItem = MenuItem & {
  quantity: number
}
export type CartSession = {
  startedAt: Date
  items: CartItem[]
}

export type Counter = SelectCounter
