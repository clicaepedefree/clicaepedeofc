import { Decimal } from 'decimal.js'
import { formatValue } from 'react-currency-input-field'

export const DecimalFormatter = Decimal.set({ precision: 2 })

export const baseCurrencyConfig = {
  groupSeparator: '.',
  decimalSeparator: ',',
  prefix: 'R$',
}

export const getValueFromCurrencyString = (value: string | number) => {
  if (typeof value === 'number') return value

  if (!value) return 0

  const cleanedValue = value
    .replaceAll(baseCurrencyConfig.groupSeparator, '')
    .replace(baseCurrencyConfig.decimalSeparator, '.')

  return parseFloat(cleanedValue)
}

export const formatValueToCurrency = ({
  value,
  includeCurrencySymbol = false,
  decimalPlaces = 2,
}: {
  value: string | number
  includeCurrencySymbol?: boolean
  decimalPlaces?: number
}) => {
  if (value !== 0 && !value) return ''

  const cleanedValue = getValueFromCurrencyString(value)

  const valueAsDecimal = new DecimalFormatter(cleanedValue).toFixed(decimalPlaces)

  if (!includeCurrencySymbol) return valueAsDecimal

  return formatValue({
    value: valueAsDecimal,
    ...baseCurrencyConfig,
    prefix: includeCurrencySymbol ? baseCurrencyConfig.prefix : undefined,
  })
}
