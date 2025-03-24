'use client'
import { Switch } from '@/shared/switch'
import { StoreConfigurationInputProps } from '@/features/store/types'
import { Label } from '@/shared/label'
import { LoadingSpinner } from '@/shared/spinner'
import { cn } from '@/lib/utils'

export const StoreConfigurationSwitch = ({ value, onChange, disabled, label }: StoreConfigurationInputProps) => {
  return (
    <Label>
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
