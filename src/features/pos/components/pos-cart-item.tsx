import { CollapsibleOptionsList } from '@/features/pos/components/collapsible-options-list'
import { CartItem } from '@/features/pos/types'
import { Button } from '@/shared/button'
import { DeleteButton } from '@/shared/buttons/delete-button'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import ImageWithPlaceholder from '@/shared/image-with-placeholder'
import { Body } from '@/shared/typography/body'
import { LargeText } from '@/shared/typography/large-text'
import { SmallText } from '@/shared/typography/small-text'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/tooltip'
import { AlertTriangle, Minus, Pencil, Plus } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export const PosCartItem = ({
  item,
  onDelete,
  onUpdateQuantity,
  onEditOptions,
  isOutOfStock = false,
  availableQuantity,
}: {
  item: CartItem
  onDelete?: () => void
  onUpdateQuantity?: (quantity: number) => void
  onEditOptions?: () => void
  isOutOfStock?: boolean
  availableQuantity?: number | null
}) => {
  const itemBasePrice = Number(item.price) * item.quantity
  const optionsPrice = (item.selectedOptions ?? []).reduce(
    (total, opt) => total + opt.price * opt.quantity,
    0
  ) * item.quantity
  const totalPriceForItem = itemBasePrice + optionsPrice

  const hasOptions = !!item.selectedOptions?.length
  const hasOptionGroups = !!item.optionGroups?.length
  const editTooltipText = hasOptionGroups
    ? 'Modificar complementos e observações'
    : 'Adicionar observação'

  return (
    <div className={cn(
      "flex items-center gap-2 p-2 rounded-md transition-colors",
      isOutOfStock && "bg-destructive/10 border border-destructive/30"
    )}>
      <ImageWithPlaceholder image={item.image} alt={item.name} size={72} containerClassName="self-start" />
      <div className="flex flex-col gap-1 grow justify-between self-stretch">
        <div className="space-y-0">
          <LargeText variant="sm">{item.name}</LargeText>
          <Body
            variant={300}
            fontWeight="regular"
            className="bg-primary/10 w-fit px-1.5 py-0.5 rounded-md text-muted-foreground"
          >
            {item.category.name}
          </Body>
        </div>
        {hasOptions && (
          <CollapsibleOptionsList options={item.selectedOptions!} />
        )}
        {item.comment && (
          <SmallText className="text-muted-foreground italic mt-0.5">
            Obs: {item.comment}
          </SmallText>
        )}
        {isOutOfStock && (
          <div className="flex items-center gap-1.5 text-destructive mt-1">
            <AlertTriangle size={14} />
            <SmallText className="text-destructive font-medium">
              {availableQuantity === 0 || availableQuantity === null
                ? 'Item indisponível'
                : `Apenas ${availableQuantity} disponível`}
            </SmallText>
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="p-1.5"
            onClick={() => onUpdateQuantity?.(item.quantity - 1)}
            disabled={item.quantity === 1}
          >
            <Minus size={16} />
          </Button>
          <Body variant={200}>{item.quantity}</Body>
          <Button variant="outline" size="icon" className="p-1.5" onClick={() => onUpdateQuantity?.(item.quantity + 1)}>
            <Plus size={16} />
          </Button>
          {onEditOptions && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="p-1.5 hover:bg-primary/10 hover:border-primary hover:text-primary transition-colors"
                  onClick={onEditOptions}
                >
                  <Pencil size={14} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {editTooltipText}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <div className="flex flex-col justify-between items-end self-stretch">
        <DeleteButton onClick={onDelete} />
        <Body variant={200} fontWeight="regular" className="pr-2">
          {formatValueToCurrency({ value: totalPriceForItem, includeCurrencySymbol: true })}
        </Body>
      </div>
    </div>
  )
}
