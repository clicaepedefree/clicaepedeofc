'use client'

import { Accordion } from '@/shared/accordion'
import { CategoryBlock } from './category-block'
import { Category } from '../../types'

type CategoriesListProps = {
  categories: Category[]
}

export const CategoriesList = ({ categories }: CategoriesListProps) => {
  return (
    <Accordion type="single" collapsible className="w-full">
      {categories?.map((category, index) => (
        <CategoryBlock
          key={category.id}
          category={category}
          isFirst={index === 0}
          isLast={index === categories.length - 1}
        />
      ))}
    </Accordion>
  )
}
