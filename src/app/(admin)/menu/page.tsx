'use client'

import { AdminPageInfo } from '@/features/admin/components/admin-page-info'
import { CategoriesList } from '@/features/menu/components/categories-list/categories-list'
import { useCategories } from '@/features/menu/hooks/use-categories'
import { OptionGroupsSection } from '@/features/option-groups/components/option-groups-section'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/tabs'
import { Headline } from '@/shared/typography/headline'
import { useAtom } from 'jotai'

export default function Page() {
  const { categories, refetch: refetchCategories } = useCategories()
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  return (
    <>
      <AdminPageInfo pageInfo={{ title: 'Cardápio / produtos' }} />
      <div className="col-span-2 flex flex-col justify-center items-start gap-2 overflow-y-hidden">
        <Headline variant={300}>Cardápio / produtos</Headline>
        <Tabs defaultValue="menu" className="w-full">
          <TabsList>
            <TabsTrigger value="menu">Cardápio</TabsTrigger>
            <TabsTrigger value="option-groups">Grupos de complementos</TabsTrigger>
          </TabsList>
          <TabsContent value="menu">
            <CategoriesList
              key={selectedStoreId}
              categories={categories}
              onCategoryCreated={refetchCategories}
              onCategoryUpdated={refetchCategories}
            />
          </TabsContent>
          <TabsContent value="option-groups">
            <OptionGroupsSection />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}
