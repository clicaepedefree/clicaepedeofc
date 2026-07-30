import { Decimal } from 'decimal.js'
import { formatValue } from 'react-currency-input-field'

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

export const normalizeCurrencyDisplayValue = (value: string | number) => {
  if (typeof value === 'number') return value

  const trimmed = value.trim()
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)

  return value
}

export const formatValueToCurrency = ({
  value,
  includeCurrencySymbol = false,
  decimalPlaces = 2,
  normalizeDisplayValue = false,
}: {
  value: string | number
  /**
   * Server-side money columns come as decimal strings such as "20.0000".
   * UI-entered values still use pt-BR separators such as "20,00".
   */
  normalizeDisplayValue?: boolean
  includeCurrencySymbol?: boolean
  decimalPlaces?: number
}) => {
  if (value !== 0 && !value) return ''

  const cleanedValue = getValueFromCurrencyString(
    normalizeDisplayValue ? normalizeCurrencyDisplayValue(value) : value
  )

  const valueAsDecimal = new Decimal(cleanedValue).toFixed(decimalPlaces)

  if (!includeCurrencySymbol) return valueAsDecimal

  return formatValue({
    value: valueAsDecimal,
    ...baseCurrencyConfig,
    prefix: includeCurrencySymbol ? baseCurrencyConfig.prefix : undefined,
  })
}
