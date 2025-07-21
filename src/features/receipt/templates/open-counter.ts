import openCounterTemplateFile from '@/features/receipt/templates/open-counter.receipt'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { formatDate } from '@/shared/formatters/date'
import { formatMultilineString } from '../formatters'
import { BaseTemplate } from './base-template'

export type OpenCounterTemplateInput = {
  openedAt: Date | string
  openAmount: string
  openNotes: string | null
  operatorName: string
  counterId: string | number
  counterName: string
}
export const OpenCounterTemplate = BaseTemplate<OpenCounterTemplateInput>({
  templateText: openCounterTemplateFile,
  preProcessing: data => {
    const formattedDate = `${formatDate(data.openedAt, 'DD/MM/YYYY HH:mm')}`
    const formattedOpenAmount = formatValueToCurrency({
      value: data.openAmount,
      includeCurrencySymbol: true,
    })
    const formattedNotes = data.openNotes
      ? formatMultilineString(data.openNotes)
      : ''
    return {
      ...data,
      openedAt: formattedDate,
      openAmount: formattedOpenAmount,
      openNotes: formattedNotes,
    }
  },
})
