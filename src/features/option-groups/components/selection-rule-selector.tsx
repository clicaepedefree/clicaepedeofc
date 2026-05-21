'use client'

import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { SmallText } from '@/shared/typography/small-text'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { Circle, CircleCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

type SelectionRulePreset = 'optional' | 'required' | 'multiple' | 'custom'

type SelectionRuleSelectorProps = {
  minQuantity: number
  maxQuantity: number
  onChange: (min: number, max: number) => void
  className?: string
}

const PRESETS: {
  id: SelectionRulePreset
  label: string
  description: string
  min: number
  max: number
}[] = [
  {
    id: 'optional',
    label: 'Opcional (até 1)',
    description: 'Cliente pode ou não escolher 1 complemento',
    min: 0,
    max: 1,
  },
  {
    id: 'required',
    label: 'Obrigatório (exatamente 1)',
    description: 'Cliente deve escolher 1 complemento',
    min: 1,
    max: 1,
  },
  {
    id: 'multiple',
    label: 'Escolha múltipla (1 a 3)',
    description: 'Cliente deve escolher de 1 a 3 complementos',
    min: 1,
    max: 3,
  },
  {
    id: 'custom',
    label: 'Personalizado...',
    description: 'Defina valores personalizados',
    min: -1,
    max: -1,
  },
]

const detectPreset = (min: number, max: number): SelectionRulePreset => {
  for (const preset of PRESETS) {
    if (preset.id === 'custom') continue
    if (preset.min === min && preset.max === max) {
      return preset.id
    }
  }
  return 'custom'
}

const formatSelectionRule = (min: number, max: number): string => {
  if (min === 0 && max === 1) {
    return 'Cliente pode escolher até 1 complemento'
  }
  if (min === 1 && max === 1) {
    return 'Cliente deve escolher exatamente 1 complemento'
  }
  if (min === 0) {
    return `Cliente pode escolher até ${max} complementos`
  }
  if (min === max) {
    return `Cliente deve escolher exatamente ${min} complemento${min > 1 ? 's' : ''}`
  }
  return `Cliente deve escolher entre ${min} e ${max} complementos`
}

export const SelectionRuleSelector = ({
  minQuantity,
  maxQuantity,
  onChange,
  className,
}: SelectionRuleSelectorProps) => {
  const initialPreset = useMemo(
    () => detectPreset(minQuantity, maxQuantity),
    [minQuantity, maxQuantity]
  )
  const [selectedPreset, setSelectedPreset] =
    useState<SelectionRulePreset>(initialPreset)
  const [customMin, setCustomMin] = useState(minQuantity)
  const [customMax, setCustomMax] = useState(maxQuantity)

  const isCustom = selectedPreset === 'custom'

  useEffect(() => {
    if (isCustom) {
      setCustomMin(minQuantity)
      setCustomMax(maxQuantity)
    }
  }, [isCustom, minQuantity, maxQuantity])

  const handlePresetChange = (presetId: SelectionRulePreset) => {
    setSelectedPreset(presetId)

    if (presetId === 'custom') {
      setCustomMin(minQuantity)
      setCustomMax(maxQuantity)
      return
    }

    const preset = PRESETS.find((p) => p.id === presetId)
    if (preset) {
      onChange(preset.min, preset.max)
    }
  }

  const handleCustomMinChange = (value: number) => {
    const sanitizedMin = Math.max(0, value)
    setCustomMin(sanitizedMin)
    const newMax = Math.max(sanitizedMin, customMax)
    setCustomMax(newMax)
    onChange(sanitizedMin, newMax)
  }

  const handleCustomMaxChange = (value: number) => {
    const sanitizedMax = Math.max(1, value)
    setCustomMax(sanitizedMax)
    const newMin = Math.min(customMin, sanitizedMax)
    setCustomMin(newMin)
    onChange(newMin, sanitizedMax)
  }

  return (
    <div className={cn('space-y-3', className)}>
      <Label className="text-sm font-medium">Regra de seleção</Label>

      <RadioGroupPrimitive.Root
        value={selectedPreset}
        onValueChange={(value) =>
          handlePresetChange(value as SelectionRulePreset)
        }
        className="space-y-2"
      >
        {PRESETS.map((preset) => (
          <RadioGroupPrimitive.Item
            key={preset.id}
            value={preset.id}
            className={cn(
              'flex items-start gap-3 w-full p-3 rounded-lg border text-left transition-colors cursor-pointer',
              'hover:bg-muted/50',
              'data-[state=checked]:border-primary data-[state=checked]:bg-primary/5'
            )}
          >
            <div className="mt-0.5 flex-shrink-0">
              {selectedPreset === preset.id ? (
                <CircleCheck className="h-5 w-5 text-primary" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{preset.label}</span>
              <SmallText className="text-muted-foreground font-normal">
                {preset.description}
              </SmallText>
            </div>
          </RadioGroupPrimitive.Item>
        ))}
      </RadioGroupPrimitive.Root>

      {isCustom && (
        <div className="grid grid-cols-2 gap-4 pt-2 pl-8">
          <Label>
            Mínimo
            <Input
              type="number"
              min={0}
              value={customMin}
              onChange={(e) => handleCustomMinChange(Number(e.target.value))}
            />
          </Label>
          <Label>
            Máximo
            <Input
              type="number"
              min={1}
              value={customMax}
              onChange={(e) => handleCustomMaxChange(Number(e.target.value))}
            />
          </Label>
        </div>
      )}

      <div className="rounded-md bg-muted/50 px-3 py-2">
        <SmallText className="text-muted-foreground font-normal text-center block">
          {formatSelectionRule(
            isCustom ? customMin : minQuantity,
            isCustom ? customMax : maxQuantity
          )}
        </SmallText>
      </div>
    </div>
  )
}
