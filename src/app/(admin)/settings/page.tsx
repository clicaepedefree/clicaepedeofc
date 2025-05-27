'use client'
import { AdminPageInfo } from '@/features/admin/components/admin-page-info'
import { StoreConfigurationCategory } from '@/features/store/components/store-configuration-category'
import { useStoreConfigurations } from '@/features/store/hooks/use-store-configurations'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Headline } from '@/shared/typography/headline'
import { useAtom } from 'jotai'

export default function Page() {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { configurationsByCategory } = useStoreConfigurations()

  return (
    <>
      <AdminPageInfo pageInfo={{ title: 'Configurações da loja' }} />
      <div className="space-y-4">
        <Headline variant={300}>Configurações da loja</Headline>
        <div key={selectedStoreId} className="grid auto-rows-min gap-x-4 gap-y-10  md:grid-cols-3">
          {configurationsByCategory.map(({ category, configurations }) => (
            <StoreConfigurationCategory key={category} category={category} configurations={configurations} />
          ))}
        </div>
      </div>
    </>
  )
}
