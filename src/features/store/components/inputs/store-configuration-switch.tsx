'use client'
import { Switch } from '@/shared/switch'
import { StoreConfigurationInputProps } from '@/features/store/types'
import { Label } from '@/shared/label'
import { LoadingSpinner } from '@/shared/spinner'
import { cn } from '@/lib/utils'

export const StoreConfigurationSwitch = ({
  configuration,
  onChange,
  isUpdating,
  label,
}: StoreConfigurationInputProps) => {
  return (
    <Label>
      <Switch
        defaultChecked={configuration.value === 'true'}
        onCheckedChange={(updatedValue: boolean) => {
          const updatedValueAsString = String(updatedValue)
          onChange?.(updatedValueAsString)
        }}
        disabled={isUpdating}
      />
      <span className={cn('flex items-center gap-1', isUpdating && 'opacity-50')}>
        {isUpdating && <LoadingSpinner size={20} />}
        {label}
      </span>
    </Label>
  )
}
