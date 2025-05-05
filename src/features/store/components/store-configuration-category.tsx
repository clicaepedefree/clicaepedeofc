'use client'
import { StoreConfiguration } from '@/features/store/types'
import { StoreConfigurationField } from '@/features/store/components/store-configuration-field'
import { Headline } from '@/shared/typography/headline'

export const StoreConfigurationCategory = ({
  category,
  configurations,
}: {
  category: string
  configurations: StoreConfiguration[]
}) => {
  return (
    <div className="space-y-2">
      <Headline variant={300}>{category}</Headline>
      <div className="flex flex-col gap-2">
        {configurations.map(configuration => (
          <StoreConfigurationField key={configuration.id} configuration={configuration} />
        ))}
      </div>
    </div>
  )
}
