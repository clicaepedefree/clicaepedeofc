import { OrderType } from '@/features/order/types'

const orderTypeToInfoMapping: Record<OrderType, { name: string }> = {
  DELIVERY: {
    name: 'Entrega',
  },
  TAKEOUT: {
    name: 'Retirada',
  },
  INDOOR: {
    name: 'Consumo local',
  },
}
export const getOrderTypeName = (orderType: OrderType | string) => {
  return orderTypeToInfoMapping[orderType as OrderType]?.name ?? orderType
}
