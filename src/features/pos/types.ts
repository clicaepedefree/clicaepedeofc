import { MenuItem } from '@/features/menu/types'
import { SelectCounter } from '@/services/db/schema'
import { NewOrderPayment } from '../order/types'

export type CartItem = MenuItem & {
  quantity: number
}

export type CartPayment = PartialBy<NewOrderPayment, 'orderId'>

export type CartSession = {
  startedAt: Date
  items: CartItem[]
  payments?: CartPayment[]
}

export type Counter = SelectCounter
