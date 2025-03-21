'use client'
import { useStoreConfigurations } from '@/features/store/hooks/use-store-configurations'
import { ConfigurationCategory } from '@/features/store/components/store-configuration-category'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useAtom } from 'jotai'

export default function Page() {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { configurationsByCategory } = useStoreConfigurations()

  return (
    <div key={selectedStoreId} className="grid auto-rows-min gap-x-4 gap-y-10  md:grid-cols-3">
      {configurationsByCategory.map(({ category, configurations }) => (
        <ConfigurationCategory key={category} category={category} configurations={configurations} />
      ))}
    </div>
  )
}
