import { useId } from 'react'

import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import BaseCurrencyInput, { type CurrencyInputProps as BaseCurrencyInputProps } from 'react-currency-input-field'
import { baseCurrencyConfig } from './formatters/currency'
import { cn } from './lib/utils'

interface CurrencyInputProps extends BaseCurrencyInputProps {
  label?: string
  prefixElement?: React.ReactNode
  inputClassName?: string
  error?: string
}

export const CurrencyInput = ({
  label,
  prefixElement,
  className,
  inputClassName,
  error,
  ...props
}: CurrencyInputProps) => {
  const id = useId()
  return (
    <Label htmlFor={id} className={cn('w-full', className)}>
      {label}
      <div className="flex w-[inherit] min-w-0">
        {prefixElement}
        <span className="shadow-xs border-input bg-accent text-muted-foreground inline-flex items-center rounded-s border-r-0 border px-2 sm:px-3 text-sm">
          {baseCurrencyConfig.prefix}
        </span>
        <BaseCurrencyInput
          id={id}
          className={cn('rounded-s-none shadow-xs px-2 sm:px-3', inputClassName)}
          placeholder="10,50"
          type="text"
          decimalSeparator={baseCurrencyConfig.decimalSeparator}
          groupSeparator={baseCurrencyConfig.groupSeparator}
          allowDecimals={true}
          allowNegativeValue={false}
          decimalsLimit={2}
          decimalScale={2}
          customInput={Input}
          disableAbbreviations
          prefix={''}
          intlConfig={{
            locale: 'pt-BR',
          }}
          {...props}
        />
      </div>
      {error && <span className="text-red-500 text-xs">{error}</span>}
    </Label>
  )
}
