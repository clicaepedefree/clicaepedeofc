import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import ImageWithPlaceholder from '@/shared/image-with-placeholder'
import { cn } from '@/shared/lib/utils'
import { Body } from '@/shared/typography/body'
import { LargeText } from '@/shared/typography/large-text'
import { MenuItem } from '../../types'

type MenuItemPOSProps = {
  item: MenuItem
  onClick?(): void
}

export const MenuItemPOS = ({ item, onClick }: MenuItemPOSProps) => {
  const isItemUnavailable = item.inventory === 0
  return (
    <div
      key={item.id}
      className={cn(
        'relative flex items-center justify-between cursor-pointer border rounded-lg h-fit overflow-hidden group/menu-item bg-white',
        {
          'hover:shadow-lg': !isItemUnavailable,
          'cursor-not-allowed': isItemUnavailable,
        }
      )}
      onClick={() => !isItemUnavailable && onClick?.()}
    >
      {isItemUnavailable && (
        <div className="h-full w-full absolute z-10">
          <Badge variant="destructive" className="m-1">
            Esgotado
          </Badge>
          <div className="h-full w-full bg-black opacity-20 absolute top-0 left-0"></div>
        </div>
      )}
      <Body
        variant={300}
        fontWeight="regular"
        className="absolute right-0 top-0 px-2 py-0.5 bg-primary/10 rounded-bl-md text-slate-500"
      >
        {item.category.name}
      </Body>
      <div className="flex items-center gap-3">
        <ImageWithPlaceholder
          size={80}
          image={item.image}
          alt={item.name}
          containerClassName="border-r h-full"
          className="border-0 rounded-r-none"
        />
        <div className="flex flex-col h-full justify-between gap-1 self-start py-4">
          <LargeText
            variant="md"
            className="font-semibold line-clamp-2 leading-5"
          >
            {item.name}
          </LargeText>
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className={cn(
          'self-end rounded-tl-3xl rounded-tr-none rounded-bl-none pr-2 pb-0',
          {
            'group-hover/menu-item:bg-primary/80 hover:bg-primary/80':
              !isItemUnavailable,
          }
        )}
        isClickable={!isItemUnavailable}
      >
        <Body
          variant={200}
          fontWeight="regular"
          className={cn('text-neutral-600', {
            'group-hover/menu-item:text-white': !isItemUnavailable,
          })}
        >
          {formatValueToCurrency({
            value: item.price,
            includeCurrencySymbol: true,
          })}
        </Body>
      </Button>
    </div>
  )
}
