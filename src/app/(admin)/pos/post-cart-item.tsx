import { CartItem } from '@/features/catalog/types'
import { DeleteButton } from '@/shared/buttons/delete-button'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import ImageWithPlaceholder from '@/shared/image-with-placeholder'
import { Body } from '@/shared/typography/body'
import { LargeText } from '@/shared/typography/large-text'

export const PosCartItem = ({ item, onDelete }: { item: CartItem; onDelete?: () => void }) => {
  return (
    <div className="flex items-center gap-2 p-2">
      <ImageWithPlaceholder image={item.image} alt={item.name} size={72} />
      <div className="flex flex-col gap-1 grow justify-between self-stretch">
        <div className="space-y-0">
          <LargeText variant="sm">{item.name}</LargeText>
          <Body variant={300} className="bg-primary/10 w-fit px-1.5 py-0.5 rounded-md">
            {item.category.name}
          </Body>
        </div>
        <div>{item.quantity}</div>
      </div>
      <div className="flex flex-col justify-between items-end self-stretch">
        <DeleteButton onClick={onDelete} />
        <Body variant={200} fontWeight="regular" className="pr-2">
          {formatValueToCurrency({ value: item.price, includeCurrencySymbol: true })}
        </Body>
      </div>
    </div>
  )
}
