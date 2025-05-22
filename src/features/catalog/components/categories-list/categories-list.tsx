'use client'

import { CategoryBlock } from '@/features/catalog/components/categories-list/category-block'
import { CategoryWithImage } from '@/features/catalog/types'
import { Accordion } from '@/shared/accordion'

type CategoriesListProps = {
  categories: CategoryWithImage[]
  onCategoryUpdated?(): void
}

export const CategoriesList = ({ categories, onCategoryUpdated }: CategoriesListProps) => {
  const categoriesIds = categories?.map(category => category.id.toString())

  return (
    <Accordion type="multiple" asChild defaultValue={categoriesIds} onValueChange={console.log}>
      <div className="flex flex-col w-full gap-4 mb-10">
        {categories?.map((category, index) => (
          <CategoryBlock
            key={category.id}
            category={category}
            isFirst={index === 0}
            isLast={index === categories.length - 1}
            onCategoryUpdated={onCategoryUpdated}
          />
        ))}
      </div>
    </Accordion>
  )
}
