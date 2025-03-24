'use client'
import { StoreConfiguration, StoreConfigurationInputProps } from '@/features/store/types'
import { StoreConfigurationSwitch } from './inputs/store-configuration-switch'
import { updateStoreConfiguration } from '../api'
import { useAtom } from 'jotai'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useState } from 'react'
import { toast } from 'sonner'
import { tryCatch } from '@/lib/utils'

const configurationTypeToComponentMapping: Record<string, (props: StoreConfigurationInputProps) => React.JSX.Element> =
  {
    switch: StoreConfigurationSwitch,
  }

const configNameToLabelMapping = {
  enable_pos: 'Habilitar balcão',
}
export const StoreConfigurationField = ({ configuration }: { configuration: StoreConfiguration }) => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const [isUpdating, setIsUpdating] = useState(false)

  // Used to force a re-render when the configuration fails to update
  const [renderVersion, setRenderVersion] = useState(0)

  const configurationLabel =
    configNameToLabelMapping[configuration.name as keyof typeof configNameToLabelMapping] ?? configuration.name

  const ConfigurationInputComponent = configurationTypeToComponentMapping[configuration.type]
  const onChangeInput = async (value: string) => {
    if (!selectedStoreId) return

    setIsUpdating(true)
    const { error } = await tryCatch(updateStoreConfiguration(selectedStoreId, configuration.id, value))
    if (error) {
      toast.error(`Erro ao atualizar configuração '${configurationLabel}'`, {
        richColors: true,
        position: 'top-center',
        dismissible: true,
      })
      setRenderVersion(prev => prev + 1)
    }
    setIsUpdating(false)
  }

  if (!ConfigurationInputComponent) return null

  return (
    <ConfigurationInputComponent
      key={`${configuration.id}-${renderVersion}`}
      label={configurationLabel}
      configuration={configuration}
      onChange={onChangeInput}
      isUpdating={isUpdating}
    />
  )
}
