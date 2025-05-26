import { Button } from '@/shared/button'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import ImageWithPlaceholder from '@/shared/image-with-placeholder'
import { Body } from '@/shared/typography/body'
import { LargeText } from '@/shared/typography/large-text'
import { CatalogItem } from '../../types'

type CatalogItemPOSProps = {
  item: CatalogItem
  onClick?(): void
}

export const CatalogItemPOS = ({ item, onClick }: CatalogItemPOSProps) => {
  return (
    <div
      key={item.id}
      className="relative flex items-center justify-between cursor-pointer border rounded-lg h-fit overflow-hidden hover:shadow-lg"
      onClick={onClick}
    >
      <div className="absolute right-0 top-0 px-2 py-0.5 text-xs bg-primary/10 rounded-bl-md">{item.category.name}</div>
      <div className="flex items-center gap-3">
        <div className="border-r h-full">
          <ImageWithPlaceholder size={80} image={item.image} alt={item.name} className="border-0 rounded-r-none" />
        </div>
        <div className="flex flex-col h-full justify-between gap-1 self-start py-4">
          <LargeText variant="md" className="font-semibold line-clamp-2 leading-5">
            {item.name}
          </LargeText>
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onClick}
        className="self-end rounded-tl-3xl rounded-tr-none rounded-bl-none"
      >
        <Body variant={200} fontWeight="regular" className="text-neutral-600">
          {formatValueToCurrency({ value: item.price, includeCurrencySymbol: true })}
        </Body>
      </Button>
    </div>
  )
}
