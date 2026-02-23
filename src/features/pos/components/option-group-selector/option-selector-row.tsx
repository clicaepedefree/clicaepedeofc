'use client'

import { Option } from '@/features/option-groups/types'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { cn } from '@/shared/lib/utils'
import { Body } from '@/shared/typography/body'
import { SmallText } from '@/shared/typography/small-text'
import { Check, Minus, Plus } from 'lucide-react'

type OptionSelectorRowProps = {
  option: Option
  quantity: number
  onQuantityChange: (quantity: number) => void
  isSingleSelect?: boolean
}

export const OptionSelectorRow = ({
  option,
  quantity,
  onQuantityChange,
  isSingleSelect = false,
}: OptionSelectorRowProps) => {
  const price = Number(option.price)
  const hasPrice = price > 0
  const isSelected = quantity > 0
  const canIncrement = quantity < option.maxQuantity
  const canDecrement = quantity > option.minQuantity

  const handleRowClick = () => {
    if (isSingleSelect) {
      onQuantityChange(isSelected ? 0 : 1)
      return
    }
    if (canIncrement) {
      onQuantityChange(quantity + 1)
    }
  }

  return (
    <div
      className={cn(
        'flex items-center justify-between py-4 px-1 cursor-pointer active:bg-muted/30 transition-colors'
      )}
      onClick={handleRowClick}
    >
      <div className="flex flex-col gap-0.5">
        <Body className="font-medium">{option.item.name}</Body>
        {hasPrice && (
          <SmallText className="text-muted-foreground">
            +{' '}
            {formatValueToCurrency({
              value: price,
              includeCurrencySymbol: true,
            })}
          </SmallText>
        )}
      </div>

      {isSingleSelect ? (
        <div
          className={cn(
            'w-5 h-5 min-w-5 min-h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0',
            isSelected
              ? 'border-primary bg-primary'
              : 'border-muted-foreground/30'
          )}
        >
          {isSelected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
        </div>
      ) : (
        <div className="flex items-center shrink-0">
          {isSelected ? (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                  canDecrement
                    ? 'text-primary hover:bg-primary/10 active:bg-primary/20'
                    : 'text-muted-foreground/40'
                )}
                onClick={event => {
                  event.stopPropagation()
                  if (canDecrement) onQuantityChange(quantity - 1)
                }}
                disabled={!canDecrement}
              >
                <Minus className="h-4 w-4" strokeWidth={2.5} />
              </button>
              <span className="w-5 text-center font-semibold text-sm tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center transition-all',
                  canIncrement
                    ? 'text-primary hover:bg-primary/10 active:bg-primary/20'
                    : 'text-muted-foreground/40'
                )}
                onClick={event => {
                  event.stopPropagation()
                  if (canIncrement) onQuantityChange(quantity + 1)
                }}
                disabled={!canIncrement}
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="w-8 h-8 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 active:bg-primary/20 transition-all"
              onClick={event => {
                event.stopPropagation()
                onQuantityChange(1)
              }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
