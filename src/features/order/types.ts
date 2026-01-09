import { InsertOrderItem } from '@/services/db/schema'
import {
  InsertOrderPayment,
  SelectOrderPayment,
} from '@/services/db/schema/order-payments'
import { InsertOrder, SelectOrder } from '@/services/db/schema/orders'

export type NewOrderItem = Omit<InsertOrderItem, 'id' | 'orderId'>
export type NewOrderPayment = Omit<InsertOrderPayment, 'id' | 'orderId'>
export type OrderPayment = SelectOrderPayment

export type NewOrder = Omit<InsertOrder, 'id' | 'displayId'> & {
  items: NewOrderItem[]
  payments: NewOrderPayment[]
}

export type PaymentMethod = SelectOrderPayment['method']
export type SalesChannel = SelectOrder['salesChannel']
export type OrderType = SelectOrder['type']

export type CardBrand = SelectOrderPayment['cardBrand']

export type Order = SelectOrder
