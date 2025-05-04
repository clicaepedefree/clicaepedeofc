'use client'
import { StoreConfigurationInputProps } from '@/features/store/types'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { LoadingSpinner } from '@/shared/spinner'
import { Switch } from '@/shared/switch'

export const StoreConfigurationSwitch = ({ value, onChange, disabled, label }: StoreConfigurationInputProps) => {
  return (
    <Label variant="inline" size="sm">
      <Switch
        defaultChecked={value === 'true'}
        onCheckedChange={(updatedValue: boolean) => {
          const updatedValueAsString = String(updatedValue)
          onChange?.(updatedValueAsString)
        }}
        disabled={disabled}
      />
      <span className={cn('flex items-center gap-1', disabled && 'opacity-50')}>
        {disabled && <LoadingSpinner size={20} />}
        {label}
      </span>
    </Label>
  )
}
