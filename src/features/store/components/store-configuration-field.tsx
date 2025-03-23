'use client'
import { StoreConfiguration, StoreConfigurationInputProps } from '@/features/store/types'
import { StoreConfigurationSwitch } from './inputs/store-configuration-switch'
import { updateStoreConfiguration } from '../api'
import { useAtom } from 'jotai'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useState } from 'react'

const configurationTypeToComponentMapping: Record<string, (props: StoreConfigurationInputProps) => React.JSX.Element> =
  {
    switch: StoreConfigurationSwitch,
  }

export const StoreConfigurationField = ({ configuration }: { configuration: StoreConfiguration }) => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const [isUpdating, setIsUpdating] = useState(false)

  const ConfigurationInputComponent = configurationTypeToComponentMapping[configuration.type]
  const onChangeInput = async (value: string) => {
    if (!selectedStoreId) return

    setIsUpdating(true)
    await updateStoreConfiguration(selectedStoreId, configuration.id, value)
    setIsUpdating(false)
  }

  if (!ConfigurationInputComponent) return null

  return (
    <ConfigurationInputComponent
      key={configuration.id}
      configuration={configuration}
      onChange={onChangeInput}
      isUpdating={isUpdating}
    />
  )
}
