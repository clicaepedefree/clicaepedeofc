import { calculateCounterSessionSummary } from '@/features/pos/db'
import closeCounterTemplateFile from '@/features/receipt/templates/close-counter.receipt'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { formatDate } from '@/shared/formatters/date'
import { getOrderTypeName } from '@/shared/formatters/order-type'
import { getPaymentMethodName } from '@/shared/formatters/payment-method'
import { getSalesChannelName } from '@/shared/formatters/sales-channel'
import { formatMultilineString } from '../formatters'
import { BaseTemplate } from './base-template'

export type CloseCounterTemplateInput = {
  openedAt: Date | string
  closedAt: Date | string
  openAmount: string
  closeAmount: string
  closeNotes: string | null
  operatorName: string
  counterId: string | number
  counterName: string
  sessionSummary: Awaited<ReturnType<typeof calculateCounterSessionSummary>>
}
export const CloseCounterTemplate = BaseTemplate<CloseCounterTemplateInput>({
  templateText: closeCounterTemplateFile,
  preProcessing: data => {
    const formattedOpenDate = `${formatDate(data.openedAt, 'DD/MM/YYYY HH:mm')}`
    const formattedCloseDate = `${formatDate(data.closedAt, 'DD/MM/YYYY HH:mm')}`
    const formattedOpenAmount = formatValueToCurrency({
      value: data.openAmount,
      includeCurrencySymbol: true,
    })
    const formattedCloseAmount = formatValueToCurrency({
      value: data.closeAmount,
      includeCurrencySymbol: true,
    })
    const formattedNotes = data.closeNotes
      ? formatMultilineString(data.closeNotes)
      : ''

    const paymentMethodsSummary = Object.entries(
      data.sessionSummary?.categoriesSummary.paymentMethod ?? {}
    ).map(([key, value]) => ({
      key: getPaymentMethodName(key),
      ordersCount: value.ordersCount,
      total: formatValueToCurrency({
        value: value.total ?? '0',
        includeCurrencySymbol: true,
      }),
    }))
    const salesChannelsSummary = Object.entries(
      data.sessionSummary?.categoriesSummary?.salesChannel ?? {}
    ).map(([key, value]) => ({
      key: getSalesChannelName(key),
      ordersCount: value.ordersCount,
      total: formatValueToCurrency({
        value: value.total ?? '0',
        includeCurrencySymbol: true,
      }),
    }))
    const orderTypesSummary = Object.entries(
      data.sessionSummary?.categoriesSummary?.orderType ?? {}
    ).map(([key, value]) => ({
      key: getOrderTypeName(key),
      ordersCount: value.ordersCount,
      total: formatValueToCurrency({
        value: value.total ?? '0',
        includeCurrencySymbol: true,
      }),
    }))

    const cashReceived = formatValueToCurrency({
      value:
        data.sessionSummary?.categoriesSummary?.paymentMethod?.CASH?.total ??
        '0',
      includeCurrencySymbol: true,
    })

    return {
      ...data,
      openedAt: formattedOpenDate,
      closedAt: formattedCloseDate,
      openAmount: formattedOpenAmount,
      closeAmount: formattedCloseAmount,
      closeNotes: formattedNotes,
      paymentMethodsSummary,
      salesChannelsSummary,
      orderTypesSummary,
      cashReceived,
    }
  },
})
