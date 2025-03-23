'use client'
import { H2 } from '@/shared/typography/h2'
import { StoreConfiguration } from '@/features/store/types'
import { StoreConfigurationField } from './store-configuration-field'

export const StoreConfigurationCategory = ({
  category,
  configurations,
}: {
  category: string
  configurations: StoreConfiguration[]
}) => {
  return (
    <div className="space-y-2">
      <H2>{category}</H2>
      <div className="flex flex-col gap-2">
        {configurations.map(configuration => (
          <StoreConfigurationField key={configuration.id} configuration={configuration} />
        ))}
      </div>
    </div>
  )
}
