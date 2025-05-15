import { useId } from 'react'

import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import BaseCurrencyInput, { type CurrencyInputProps as BaseCurrencyInputProps } from 'react-currency-input-field'
import { cn } from './lib/utils'

interface CurrencyInputProps extends BaseCurrencyInputProps {
  label: string
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
    <Label htmlFor={id} className={className}>
      {label}
      <div className="flex w-full">
        {prefixElement}
        <span className="shadow-xs  border-input bg-accent text-muted-foreground -z-10 inline-flex items-center rounded-s border-r-0 border px-3 text-sm">
          R$
        </span>
        <BaseCurrencyInput
          id={id}
          className={cn('rounded-s-none shadow-xs', inputClassName)}
          placeholder="10,50"
          type="text"
          decimalSeparator=","
          groupSeparator="."
          allowDecimals={true}
          allowNegativeValue={false}
          decimalsLimit={2}
          decimalScale={2}
          customInput={Input}
          {...props}
        />
      </div>
      {error && <span className="text-red-500 text-xs">{error}</span>}
    </Label>
  )
}
