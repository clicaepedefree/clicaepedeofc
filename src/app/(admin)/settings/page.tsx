'use client'
import { useStoreConfigurations } from '@/features/store/hooks/use-store-configurations'
import { ConfigurationCategory } from '@/features/store/components/store-configuration-category'

export default function Page() {
  const { configurationsByCategory } = useStoreConfigurations()

  return (
    <div className="grid auto-rows-min gap-x-4 gap-y-10  md:grid-cols-3">
      {configurationsByCategory.map(({ category, configurations }) => (
        <ConfigurationCategory key={category} category={category} configurations={configurations} />
      ))}
    </div>
  )
}
