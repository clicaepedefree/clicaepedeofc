import { useId } from 'react'

import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import BaseCurrencyInput from 'react-currency-input-field'

export const CurrencyInput = ({ label }: { label: string }) => {
  const id = useId()
  return (
    <Label htmlFor={id}>
      {label}
      <div className="flex shadow-xs w-full">
        <span className="border-input bg-accent text-muted-foreground -z-10 inline-flex items-center rounded-s border-r-0 border px-3 text-sm">
          R$
        </span>
        <BaseCurrencyInput
          id={id}
          className="rounded-s-none shadow-none"
          placeholder="10,50"
          type="text"
          decimalSeparator=","
          groupSeparator="."
          allowDecimals={true}
          allowNegativeValue={false}
          decimalsLimit={2}
          decimalScale={2}
          customInput={Input}
        />
      </div>
    </Label>
  )
}
