'use client'
import { selectedStoreIdAtom } from '@/features/store/state'
import { StoreConfiguration, StoreConfigurationInputProps } from '@/features/store/types'
import { dispatchToast } from '@/shared/lib/toast'
import { useAtom } from 'jotai'
import { useState } from 'react'
import { useUpdateStoreConfiguration } from '../hooks/use-update-store-configuration'
import { StoreConfigurationSwitch } from '@/features/store/components/inputs/store-configuration-switch'

const configurationTypeToComponentMapping: Record<string, (props: StoreConfigurationInputProps) => React.JSX.Element> =
  {
    switch: StoreConfigurationSwitch,
  }

const configNameToLabelMapping = {
  enable_pos: 'Habilitar balcão',
}

export const StoreConfigurationField = ({ configuration }: { configuration: StoreConfiguration }) => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  // Used to force a re-render when the configuration fails to update
  const [renderVersion, setRenderVersion] = useState(0)

  const updateConfiguration = useUpdateStoreConfiguration()

  const configurationLabel =
    configNameToLabelMapping[configuration.name as keyof typeof configNameToLabelMapping] ?? configuration.name

  const ConfigurationInputComponent = configurationTypeToComponentMapping[configuration.type]

  const onChangeInput = async (value: string) => {
    if (!selectedStoreId) return

    updateConfiguration.mutate(
      { storeId: selectedStoreId, configurationId: configuration.id, value },
      {
        onError: () => {
          dispatchToast({ message: `Erro ao atualizar configuração '${configurationLabel}'`, type: 'error' })
          setRenderVersion(prev => prev + 1)
        },
      }
    )
  }

  if (!ConfigurationInputComponent) return null

  return (
    <ConfigurationInputComponent
      key={`${configuration.id}-${renderVersion}`}
      label={configurationLabel}
      value={configuration.value}
      onChange={onChangeInput}
      disabled={updateConfiguration.isPending}
    />
  )
}
