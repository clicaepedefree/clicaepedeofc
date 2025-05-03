'use client'

import { Headline } from '@/shared/typography/headline'
import { CreateCategoryActionButton } from '@/features/catalog/components/create-category/create-category-action-button'
import { useCategories } from '@/features/catalog/hooks/use-categories'
import { CategoriesList } from '@/features/catalog/components/categories-list/categories-list'

export default function Page() {
  const { categories, refetch: refetchCategories } = useCategories()

  return (
    <div className="col-span-2 flex flex-col justify-center items-start gap-2">
      <Headline variant={300}>Cardápio / produtos</Headline>
      <div className="flex justify-end w-full">
        <CreateCategoryActionButton onSuccess={() => refetchCategories()} />
      </div>
      <CategoriesList categories={categories ?? []} />
    </div>
  )
}
