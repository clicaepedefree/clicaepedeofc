'use client'

import { AdminPageInfo } from '@/features/admin/components/admin-page-info'
import { CategoriesList } from '@/features/catalog/components/categories-list/categories-list'
import { useCategories } from '@/features/catalog/hooks/use-categories'
import { Headline } from '@/shared/typography/headline'

export default function Page() {
  const { categories, refetch: refetchCategories } = useCategories()
  return (
    <>
      <AdminPageInfo pageInfo={{ title: 'Cardápio / produtos' }} />
      <div className="col-span-2 flex flex-col justify-center items-start gap-2 overflow-y-hidden">
        <Headline variant={300}>Cardápio / produtos</Headline>
        <CategoriesList
          categories={categories}
          onCategoryCreated={refetchCategories}
          onCategoryUpdated={refetchCategories}
        />
      </div>
    </>
  )
}
