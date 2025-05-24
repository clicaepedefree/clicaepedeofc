import { Decimal } from 'decimal.js'
import { cleanValue, formatValue } from 'react-currency-input-field'

export const DecimalFormatter = Decimal.set({ precision: 2 })

export const baseCurrencyConfig = {
  groupSeparator: '.',
  decimalSeparator: ',',
  prefix: 'R$',
}

export const getValueFromCurrencyString = (value: string | number) => {
  if (!value) return ''
  if (typeof value === 'number') return value

  const cleanedValue = value.replace(baseCurrencyConfig.decimalSeparator, '.')

  return parseFloat(cleanedValue)
}

export const formatValueToCurrency = ({
  value,
  includeCurrencySymbol = false,
}: {
  value: string | number
  includeCurrencySymbol?: boolean
}) => {
  if (!value) return ''

  const cleanedValue = getValueFromCurrencyString(value)

  const valueAsDecimal = new DecimalFormatter(cleanedValue).toFixed(2)

  if (!includeCurrencySymbol) return valueAsDecimal

  return formatValue({
    value: valueAsDecimal,
    ...baseCurrencyConfig,
    prefix: includeCurrencySymbol ? baseCurrencyConfig.prefix : undefined,
  })
}
