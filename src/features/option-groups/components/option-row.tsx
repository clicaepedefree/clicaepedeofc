'use client'

import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { ReorderButtons } from '@/shared/buttons/reorder-buttons'
import { Combobox } from '@/shared/combobox'
import { CurrencyInput } from '@/shared/currency-input'
import {
  formatValueToCurrency,
  getValueFromCurrencyString,
} from '@/shared/formatters/currency'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { SmallText } from '@/shared/typography/small-text'
import { Check, Trash2 } from 'lucide-react'
import { useMemo } from 'react'

export type OptionRowValue = {
  id?: number
  itemId: number
  itemName?: string
  price: string
  originalPrice: string | null
  minQuantity: number
  maxQuantity: number
  index: number
}

export type ItemForOptionRow = {
  id: number
  name: string
  categoryName: string
  categoryId: number
  price: string
}

type OptionRowProps = {
  value: OptionRowValue
  onChange: (updated: OptionRowValue) => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  items: ItemForOptionRow[]
  className?: string
  displayIndex?: number
  error?: {
    itemId?: string
    price?: string
    maxQuantity?: string
  }
}

export const OptionRow = ({
  value,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  items,
  className,
  displayIndex,
  error,
}: OptionRowProps) => {
  const groupedItems = useMemo(() => {
    const grouped = items.reduce(
      (acc, item) => {
        const key = String(item.categoryId)
        if (!acc[key]) {
          acc[key] = {
            groupKey: key,
            groupLabel: item.categoryName,
            items: [],
          }
        }
        acc[key].items.push(item)
        return acc
      },
      {} as Record<
        string,
        { groupKey: string; groupLabel: string; items: ItemForOptionRow[] }
      >
    )
    return Object.values(grouped)
  }, [items])

  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:grid sm:grid-cols-[auto_auto_1fr_auto_auto_auto] sm:gap-2 sm:items-end',
        className
      )}
    >
      {/* Index number and reorder buttons */}
      <div className="flex items-center gap-2 sm:contents">
        {displayIndex !== undefined && (
          <SmallText className="font-semibold text-muted-foreground w-6 text-center sm:self-end sm:pb-2">
            {displayIndex}.
          </SmallText>
        )}
        <ReorderButtons
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          layout="horizontal"
          className="sm:flex-col sm:pb-0.5"
        />
        {/* Mobile: delete button at end of first row */}
        <div className="flex-1 sm:hidden" />
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="text-destructive hover:text-destructive sm:hidden"
          type="button"
        >
          <Trash2 size={16} />
        </Button>
      </div>

      {/* Item selector - full width on mobile */}
      <Label className="w-full sm:w-auto">
        Item
        <Combobox
          options={items}
          groupedOptions={groupedItems}
          value={value.itemId ? String(value.itemId) : ''}
          onChange={(selectedValue) => {
            const itemId = Number(selectedValue)
            const item = items.find((i) => i.id === itemId)
            onChange({
              ...value,
              itemId,
              itemName: item?.name,
            })
          }}
          customKeyValueParserForOption={(option) => ({
            value: String(option.id),
            label: option.name,
            keywords: [option.name, option.categoryName],
          })}
          customOptionLabelComponent={(option) => (
            <ItemOptionLabel
              item={option}
              isSelected={value.itemId === option.id}
            />
          )}
          placeholder="Selecione um item"
          searchPlaceholder="Buscar item..."
          noResultMessage="Nenhum item encontrado"
          disableUnselectingOption
        />
        {error?.itemId && (
          <span className="text-red-500 text-xs">{error.itemId}</span>
        )}
      </Label>

      {/* Price and quantity - horizontal on mobile */}
      <div className="flex gap-2 items-end">
        <div className="flex-1 sm:w-28">
          <CurrencyInput
            label="Preço"
            value={value.price}
            onValueChange={(newPrice) =>
              onChange({ ...value, price: newPrice ?? '0' })
            }
            className="w-full"
            error={error?.price}
          />
          <PriceFeedback
            price={value.price}
            onSetIncluded={() => onChange({ ...value, price: '0' })}
          />
        </div>
        <Label className="flex-1 sm:w-auto">
          Qtd máx.
          <Input
            type="number"
            min={1}
            value={value.maxQuantity}
            onChange={(e) =>
              onChange({ ...value, maxQuantity: Number(e.target.value) || 1 })
            }
            className="w-full sm:w-20"
            error={error?.maxQuantity}
          />
        </Label>
      </div>

      {/* Desktop: delete button */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="text-destructive hover:text-destructive hidden sm:flex"
        type="button"
      >
        <Trash2 size={16} />
      </Button>
    </div>
  )
}

const PriceFeedback = ({
  price,
  onSetIncluded,
}: {
  price: string
  onSetIncluded: () => void
}) => {
  const priceValue = getValueFromCurrencyString(price)

  if (priceValue === 0) {
    return (
      <div className="mt-1">
        <Badge variant="secondary" className="text-xs">
          Incluído
        </Badge>
      </div>
    )
  }

  return (
    <div className="mt-1 flex items-center gap-2">
      <SmallText className="text-green-600 font-medium">
        +{formatValueToCurrency({ value: priceValue, includeCurrencySymbol: true })}
      </SmallText>
      <button
        type="button"
        onClick={onSetIncluded}
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        Marcar como incluído
      </button>
    </div>
  )
}

const ItemOptionLabel = ({
  item,
  isSelected,
}: {
  item: ItemForOptionRow
  isSelected: boolean
}) => {
  const priceValue = getValueFromCurrencyString(item.price)
  const formattedPrice = formatValueToCurrency({
    value: priceValue,
    includeCurrencySymbol: true,
  })

  return (
    <div className="flex items-center justify-between w-full gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Check
          className={cn('h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')}
        />
        <span className="truncate">{item.name}</span>
      </div>
      <span className="text-muted-foreground text-sm shrink-0">
        {formattedPrice}
      </span>
    </div>
  )
}
