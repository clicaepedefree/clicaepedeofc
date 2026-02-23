'use client'

import { formatValueToCurrency } from '@/shared/formatters/currency'
import { cn } from '@/shared/lib/utils'
import { SmallText } from '@/shared/typography/small-text'

type OptionItemLineProps = {
  name: string
  quantity: number
  price: number
  groupName?: string
  indented?: boolean
  className?: string
}

export const OptionItemLine = ({
  name,
  quantity,
  price,
  groupName,
  indented = false,
  className,
}: OptionItemLineProps) => {
  const hasPrice = price > 0
  const totalPrice = price * quantity

  return (
    <div className={cn('flex items-center justify-between gap-2', indented && 'pl-2', className)}>
      <SmallText className="text-muted-foreground">
        {groupName && `${groupName}: `}
        {name} x{quantity}
      </SmallText>
      {hasPrice && (
        <SmallText className="text-muted-foreground shrink-0">
          +{formatValueToCurrency({ value: totalPrice, includeCurrencySymbol: true })}
        </SmallText>
      )}
    </div>
  )
}
