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
    <div key={category.id} className="flex flex-col items-center justify-start text-center" onClick={onClick}>
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
    </div>
  )
}
