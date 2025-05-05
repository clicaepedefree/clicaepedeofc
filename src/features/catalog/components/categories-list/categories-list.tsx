'use client'

import { CategoryBlock } from '@/features/catalog/components/categories-list/category-block'
import { CategoryWithImage } from '@/features/catalog/types'
import { Accordion } from '@/shared/accordion'

type CategoriesListProps = {
  categories: CategoryWithImage[]
}

export const CategoriesList = ({ categories }: CategoriesListProps) => {
  return (
    <Accordion type="single" collapsible asChild>
      <div className="flex flex-col w-full gap-2">
        {categories?.map((category, index) => (
          <CategoryBlock
            key={category.id}
            category={category}
            isFirst={index === 0}
            isLast={index === categories.length - 1}
          />
        ))}
      </div>
    </Accordion>
  )
}
