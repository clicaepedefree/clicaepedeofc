import { InsertOrderItem } from '@/services/db/schema'
import { InsertOrder, SelectOrder } from '@/services/db/schema/orders'

export type NewOrderItem = Omit<InsertOrderItem, 'id' | 'orderId'>

export type NewOrder = Omit<InsertOrder, 'id' | 'displayId'> & {
  items: NewOrderItem[]
}

export type SalesChannel = SelectOrder['salesChannel']
export type OrderType = SelectOrder['type']
