import { PaymentMethod } from '@/features/order/types'

const paymentMethodToInfoMapping: Record<PaymentMethod, { name: string }> = {
  CASH: {
    name: 'Dinheiro',
  },
  DEBIT: {
    name: 'Cartão de débito',
  },
  CREDIT: {
    name: 'Cartão de crédito',
  },
  FOOD_VOUCHER: {
    name: 'Vale alimentação',
  },
  MEAL_VOUCHER: {
    name: 'Vale refeição',
  },
  PIX: {
    name: 'PIX',
  },
}
export const getPaymentMethodName = (paymentMethod: PaymentMethod | string) => {
  return (
    paymentMethodToInfoMapping[paymentMethod as PaymentMethod]?.name ??
    paymentMethod
  )
}
