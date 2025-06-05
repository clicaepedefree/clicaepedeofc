import { InsertOrderItem } from '@/services/db/schema'
import { InsertOrderPayment, SelectOrderPayment } from '@/services/db/schema/order-payments'
import { InsertOrder, SelectOrder } from '@/services/db/schema/orders'

export type NewOrderItem = Omit<InsertOrderItem, 'id' | 'orderId'>

export type NewOrder = Omit<InsertOrder, 'id' | 'displayId'> & {
  items: NewOrderItem[]
}

export type SalesChannel = SelectOrder['salesChannel']
export type OrderType = SelectOrder['type']

export type NewOrderPayment = Omit<InsertOrderPayment, 'id'>
export type OrderPayment = SelectOrderPayment
