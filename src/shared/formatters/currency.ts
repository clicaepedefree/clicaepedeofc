import { Decimal } from 'decimal.js'
import { formatValue } from 'react-currency-input-field'

export const DecimalFormatter = Decimal.set({ precision: 2 })

export const baseCurrencyConfig = {
  groupSeparator: '.',
  decimalSeparator: ',',
  prefix: 'R$',
}

export const formatNumberToCurrency = (value: string | number) => {
  const valueAsDecimal = new DecimalFormatter(value).toFixed(2)

  return formatValue({
    value: valueAsDecimal,
    ...baseCurrencyConfig,
  })
}
