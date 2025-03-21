'use client'
import { useState } from 'react'
import { Switch } from '@/shared/switch'
import { StoreConfiguration } from '@/features/store/types'
import { Label } from '@/shared/label'

export const ConfigurationSwitch = ({ configuration }: { configuration: StoreConfiguration }) => {
  const [configurationValue, setConfigurationValue] = useState(configuration.value === 'true')
  const configLabel =
    configNameToLabelMapping[configuration.name as keyof typeof configNameToLabelMapping] ?? configuration.name
  return (
    <div className="flex items-center space-x-2">
      <Label>
        <Switch checked={configurationValue} onCheckedChange={setConfigurationValue} />
        <span>{configLabel}</span>
      </Label>
    </div>
  )
}

const configNameToLabelMapping = {
  first_config: 'First Config',
}
