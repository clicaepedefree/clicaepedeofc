import { CartItem } from '@/features/pos/types'
import { Button } from '@/shared/button'
import { DeleteButton } from '@/shared/buttons/delete-button'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import ImageWithPlaceholder from '@/shared/image-with-placeholder'
import { Body } from '@/shared/typography/body'
import { LargeText } from '@/shared/typography/large-text'
import { Minus, Plus } from 'lucide-react'

export const PosCartItem = ({
  item,
  onDelete,
  onUpdateQuantity,
}: {
  item: CartItem
  onDelete?: () => void
  onUpdateQuantity?: (quantity: number) => void
}) => {
  const totalPriceForItem = Number(item.price) * item.quantity

  return (
    <div className="flex items-center gap-2 p-2">
      <ImageWithPlaceholder image={item.image} alt={item.name} size={72} containerClassName="self-start" />
      <div className="flex flex-col gap-1 grow justify-between self-stretch">
        <div className="space-y-0">
          <LargeText variant="sm">{item.name}</LargeText>
          <Body
            variant={300}
            fontWeight="regular"
            className="bg-primary/10 w-fit px-1.5 py-0.5 rounded-md text-slate-500"
          >
            {item.category.name}
          </Body>
        </div>
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
