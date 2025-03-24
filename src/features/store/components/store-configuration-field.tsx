'use client'
import { StoreConfiguration, StoreConfigurationInputProps } from '@/features/store/types'
import { StoreConfigurationSwitch } from './inputs/store-configuration-switch'
import { useAtom } from 'jotai'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useState } from 'react'
import { toast } from 'sonner'
import { useUpdateStoreConfiguration } from '../hooks/use-update-store-configuration'

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
          toast.error(`Erro ao atualizar configuração '${configurationLabel}'`, {
            richColors: true,
            position: 'top-center',
            dismissible: true,
          })
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
