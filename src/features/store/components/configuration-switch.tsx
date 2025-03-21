'use client'
import { Switch } from '@/shared/switch'
import { StoreConfiguration } from '@/features/store/types'
import { Label } from '@/shared/label'

export const ConfigurationSwitch = ({ configuration }: { configuration: StoreConfiguration }) => {
  const configLabel =
    configNameToLabelMapping[configuration.name as keyof typeof configNameToLabelMapping] ?? configuration.name
  return (
    <div className="flex items-center space-x-2">
      <Label>
        <Switch defaultChecked={configuration.value === 'true'} />
        <span>{configLabel}</span>
      </Label>
    </div>
  )
}

const configNameToLabelMapping = {
  enable_pos: 'Habilitar balcão',
}
