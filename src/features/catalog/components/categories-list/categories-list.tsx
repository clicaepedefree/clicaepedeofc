'use client'

import { CategoryBlock } from '@/features/catalog/components/categories-list/category-block'
import { CategoryWithImage } from '@/features/catalog/types'
import { Accordion } from '@/shared/accordion'
import { useState } from 'react'
import { CreateCategoryActionButton } from '../create-or-update-category/create-category-action-button'

type CategoriesListProps = {
  categories: CategoryWithImage[]
  onCategoryCreated?(): void
  onCategoryUpdated?(): void
}

export const CategoriesList = ({ categories, onCategoryCreated, onCategoryUpdated }: CategoriesListProps) => {
  const [openedCategoryIds, setOpenedCategoryIds] = useState<Set<string>>(
    new Set(categories.map(category => category.id.toString()))
  )

  const onCategoryOpenedStateChange = (isOpen: boolean, categoryId: string) => {
    const updatedOpenedCategories = new Set(openedCategoryIds)
    isOpen ? updatedOpenedCategories.add(categoryId) : updatedOpenedCategories.delete(categoryId)

    setOpenedCategoryIds(updatedOpenedCategories)
  }

  const hasCategories = !!categories?.length

  return (
    <>
      <div className="flex justify-end w-full">
        <CreateCategoryActionButton
          onSuccess={newCategory => {
            onCategoryOpenedStateChange(true, newCategory.id.toString())
            onCategoryCreated?.()
          }}
        />
      </div>
      {hasCategories && (
        <Accordion
          type="multiple"
          asChild
          value={[...openedCategoryIds]}
          onValueChange={updatedCategoryIds => setOpenedCategoryIds(new Set(updatedCategoryIds))}
        >
          <div className="flex flex-col w-full gap-4 mb-10">
            {categories?.map((category, index) => (
              <CategoryBlock
                key={category.id}
                category={category}
                isFirst={index === 0}
                isLast={index === categories.length - 1}
                onCategoryUpdated={onCategoryUpdated}
                onUpdateOpenedState={isOpen => onCategoryOpenedStateChange(isOpen, category.id.toString())}
              />
            ))}
          </div>
        </Accordion>
      )}
    </>
  )
}
