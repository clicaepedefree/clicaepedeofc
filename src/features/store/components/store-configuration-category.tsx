'use client'
import { H2 } from '@/shared/typography/h2'
import { StoreConfiguration } from '@/features/store/types'
import { ConfigurationSwitch } from './configuration-switch'

export const ConfigurationCategory = ({
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
          <ConfigurationSwitch key={configuration.id} configuration={configuration} />
        ))}
      </div>
    </div>
  )
}
