'use client'

import { H2 } from '@/shared/typography/h2'
import { CreateCategoryActionButton } from '@/features/catalog/components/create-category/create-category-action-button'
import { useCategories } from '@/features/catalog/hooks/use-categories'

export default function Page() {
  const { categories, refetch: refetchCategories } = useCategories()
  console.log('categories', categories)
  return (
    <div className="col-span-2 flex flex-col justify-center items-start">
      <H2>Cardápio / produtos</H2>
      <CreateCategoryActionButton onSuccess={() => refetchCategories()} />
    </div>
  )
}
