import { BaseCategory } from '@/features/menu/types'
import ImageWithPlaceholder from '@/shared/image-with-placeholder'
import { cn } from '@/shared/lib/utils'
import { Body } from '@/shared/typography/body'

export const PosCategoryFilter = ({
  category,
  isSelected,
  onClick,
}: {
  category: BaseCategory | PartialBy<BaseCategory, 'id'>
  isSelected?: boolean
  onClick?: () => void
}) => {
  return (
    <button
      key={category.id}
      type="button"
      className="flex min-w-20 flex-col items-center justify-start rounded-lg text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50"
      onClick={onClick}
    >
      <ImageWithPlaceholder
        image={category.imageUrl ? { url: category.imageUrl } : undefined}
        alt={category.name}
        className={cn('rounded-full', {
          'border-[3px] border-primary': isSelected,
        })}
      />
      <Body variant={200} className={cn({ 'text-primary': isSelected })}>
        {category.name}
      </Body>
    </button>
  )
}
