'use client'

import { CategoriesList } from '@/features/catalog/components/categories-list/categories-list'
import { CreateCategoryActionButton } from '@/features/catalog/components/create-or-update-category/create-category-action-button'
import { CreateProductActionButton } from '@/features/catalog/components/create-or-update-product/create-product-action-button'
import { useCategories } from '@/features/catalog/hooks/use-categories'
import { Headline } from '@/shared/typography/headline'

export default function Page() {
  const { categories, refetch: refetchCategories } = useCategories()
  const hasCategories = !!categories?.length
  return (
    <div className="col-span-2 flex flex-col justify-center items-start gap-2">
      <Headline variant={300}>Cardápio / produtos</Headline>
      <div className="flex justify-end w-full">
        <CreateCategoryActionButton onSuccess={() => refetchCategories()} />
        <CreateProductActionButton onSuccess={console.log} />
      </div>
      {hasCategories && <CategoriesList categories={categories} />}
    </div>
  )
}
