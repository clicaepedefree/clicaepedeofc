import { MenuItem } from '@/features/menu/types'
import { SelectCounter, SelectCounterSession } from '@/services/db/schema'
import { NewOrderPayment } from '../order/types'

export type CartItemOption = {
  optionGroupName: string
  optionName: string
  price: number
  quantity: number
}

export type CartItem = MenuItem & {
  quantity: number
  selectedOptions?: CartItemOption[]
  comment?: string
}

export type CartPayment = NewOrderPayment
export type CartPaymentMethod = NewOrderPayment['method']

export type CartSession = {
  startedAt: Date
  items: CartItem[]
  payments?: CartPayment[]
}

export type CounterSession = SelectCounterSession & {
  operatorName: string | null
  operatorEmail: string | null
}

export type Counter = SelectCounter & {
  isInService?: boolean
  currentSession?: CounterSession
}
