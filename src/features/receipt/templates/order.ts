import orderTemplateFile from '@/features/receipt/templates/order.receipt'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { formatDate } from '@/shared/formatters/date'
import { getOrderTypeName } from '@/shared/formatters/order-type'
import { getPaymentMethodName } from '@/shared/formatters/payment-method'
import { BaseTemplate } from './base-template'
import Decimal from 'decimal.js'

export type OrderTemplateItemOption = {
  optionName: string
  optionQuantity: string | number
  optionPrice?: string | number
}

export type OrderTemplateItem = {
  itemName: string
  quantity: string | number
  unitPrice: string | number
  totalPrice: string | number
  options?: OrderTemplateItemOption[]
  comment?: string | null
}

export type OrderTemplatePayment = {
  method: string
  value: string | number
  changeFor?: string | number | null
}

// Internal type for preprocessed/formatted template data
type FormattedOrderTemplateInput = {
  storeName?: string | null
  displayId: string
  createdAt: string
  orderType: string
  posCounterName?: string | null
  items: Array<{
    itemName: string
    quantity: string | number
    unitPrice: string
    totalPrice: string
    options?: Array<{ optionName: string; optionQuantity: string | number }>
    comment?: string | null
  }>
  discount?: string
  totalPrice: string
  payments: Array<{
    paymentMethod: string
    paymentValue: string
    changeFor?: string
    changeValue?: string
  }>
  customerName?: string | null
  customerPhone?: string | null
  customerAddress?: string | null
}

export type OrderTemplateInput = {
  storeName?: string | null
  displayId: string
  createdAt: Date | string
  orderType: string
  posCounterName?: string | null
  items: OrderTemplateItem[]
  discount?: string | number | null
  totalPrice: string | number
  payments: OrderTemplatePayment[]
  customerName?: string | null
  customerPhone?: string | null
  customerAddress?: string | null
}

export const OrderTemplate = BaseTemplate<OrderTemplateInput>({
  templateText: orderTemplateFile,
  preProcessing: data => {
    const formattedDate = formatDate(data.createdAt, 'DD/MM/YYYY HH:mm')
    const formattedOrderType = getOrderTypeName(data.orderType)
    const formattedTotalPrice = formatValueToCurrency({
      value: data.totalPrice,
      includeCurrencySymbol: true,
    })
    const formattedDiscount = data.discount
      ? formatValueToCurrency({
          value: data.discount,
          includeCurrencySymbol: true,
        })
      : undefined

    const formattedItems = data.items.map(item => {
      const formattedUnitPrice = formatValueToCurrency({
        value: item.unitPrice,
        includeCurrencySymbol: true,
      })
      const formattedItemTotal = formatValueToCurrency({
        value: item.totalPrice,
        includeCurrencySymbol: true,
      })
      const formattedOptions = item.options?.map(option => ({
        optionName: option.optionName,
        optionQuantity: option.optionQuantity,
      }))

      return {
        itemName: item.itemName,
        quantity: item.quantity,
        unitPrice: formattedUnitPrice,
        totalPrice: formattedItemTotal,
        options: formattedOptions,
        comment: item.comment,
      }
    })

    const formattedPayments = data.payments.map(payment => {
      const formattedPaymentValue = formatValueToCurrency({
        value: payment.value,
        includeCurrencySymbol: true,
      })
      const formattedChangeFor = payment.changeFor
        ? formatValueToCurrency({
            value: payment.changeFor,
            includeCurrencySymbol: true,
          })
        : undefined

      // Calculate change value if changeFor is provided
      let formattedChangeValue: string | undefined
      if (payment.changeFor) {
        const changeForDecimal = new Decimal(payment.changeFor.toString())
        const valueDecimal = new Decimal(payment.value.toString())
        const changeValue = changeForDecimal.minus(valueDecimal)
        if (changeValue.greaterThan(0)) {
          formattedChangeValue = formatValueToCurrency({
            value: changeValue.toString(),
            includeCurrencySymbol: true,
          })
        }
      }

      return {
        paymentMethod: getPaymentMethodName(payment.method),
        paymentValue: formattedPaymentValue,
        changeFor: formattedChangeFor,
        changeValue: formattedChangeValue,
      }
    })

    return {
      ...data,
      createdAt: formattedDate,
      orderType: formattedOrderType,
      totalPrice: formattedTotalPrice,
      discount: formattedDiscount,
      items: formattedItems,
      payments: formattedPayments,
    } as unknown as OrderTemplateInput
  },
})
