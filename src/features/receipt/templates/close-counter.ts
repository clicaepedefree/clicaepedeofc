import closeCounterTemplateFile from '@/features/receipt/templates/close-counter.receipt'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { formatDate } from '@/shared/formatters/date'
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
    return {
      ...data,
      openedAt: formattedOpenDate,
      closedAt: formattedCloseDate,
      openAmount: formattedOpenAmount,
      closeAmount: formattedCloseAmount,
      closeNotes: formattedNotes,
    }
  },
})
