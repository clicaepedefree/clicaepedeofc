'use client'

import { OptionGroupWithOptions } from '@/features/option-groups/types'
import { cn } from '@/shared/lib/utils'
import { Body } from '@/shared/typography/body'
import { SmallText } from '@/shared/typography/small-text'
import { Check } from 'lucide-react'
import { OptionSelectorRow } from './option-selector-row'

type OptionQuantities = Record<number, number>

type OptionGroupStepProps = {
  group: OptionGroupWithOptions
  selections: OptionQuantities
  onSelectionChange: (optionId: number, quantity: number) => void
  onClearOtherSelections?: (exceptOptionId: number) => void
  shake?: boolean
  highlight?: boolean
}

const getSelectionLabel = (
  min: number,
  max: number,
  totalSelected: number
): string => {
  if (min === 0 && max === 1) return 'Escolha até 1 opção'
  if (min === max) {
    const remaining = min - totalSelected
    if (remaining > 0)
      return `Escolha ${remaining} ${remaining === 1 ? 'opção' : 'opções'}`
    return `${min} ${min === 1 ? 'opção selecionada' : 'opções selecionadas'}`
  }
  if (min === 0) return `Escolha até ${max} opções`
  const remaining = min - totalSelected
  if (remaining > 0)
    return `Escolha ${remaining} ${remaining === 1 ? 'opção' : 'opções'}`
  return `${totalSelected} de ${max} selecionadas`
}

export const OptionGroupStep = ({
  group,
  selections,
  onSelectionChange,
  onClearOtherSelections,
  shake = false,
  highlight = false,
}: OptionGroupStepProps) => {
  const totalSelected = Object.values(selections).reduce(
    (accumulatedTotal, optionQuantity) => accumulatedTotal + optionQuantity,
    0
  )
  const isComplete = totalSelected >= group.minQuantity
  const isAtMax = totalSelected >= group.maxQuantity
  const isSingleSelect = group.maxQuantity === 1
  const isRequired = group.minQuantity > 0

  const handleSingleSelectChange = (optionId: number, newQuantity: number) => {
    if (newQuantity === 1) {
      onClearOtherSelections?.(optionId)
    }
    onSelectionChange(optionId, newQuantity)
  }

  return (
    <div
      className={cn('transition-all duration-300', {
        'animate-shake': shake && !isComplete,
      })}
    >
      <div
        className={cn(
          'py-3 px-4 flex items-center justify-between gap-3',
          highlight && !isComplete ? 'rounded-md bg-amber-100' : 'bg-muted/50'
        )}
      >
        <div className="min-w-0 flex-1">
          <Body className="font-semibold truncate">{group.name}</Body>
          <SmallText className="text-muted-foreground">
            {getSelectionLabel(
              group.minQuantity,
              group.maxQuantity,
              totalSelected
            )}
          </SmallText>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {group.maxQuantity > 1 && (
            <div
              className={cn(
                'px-2 py-1 rounded-full text-xs font-semibold tabular-nums',
                isComplete
                  ? 'bg-primary/15 text-primary'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {totalSelected}/{group.maxQuantity}
            </div>
          )}
          {isRequired &&
            (isComplete ? (
              <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center">
                <Check className="h-3.5 w-3.5 text-accent" strokeWidth={3} />
              </div>
            ) : (
              <div className="px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-foreground text-background">
                Obrigatório
              </div>
            ))}
        </div>
      </div>

      <div className="divide-y divide-border px-4">
        {group.options.map(option => {
          const currentQuantity = selections[option.id] ?? 0
          return (
            <OptionSelectorRow
              key={option.id}
              option={option}
              quantity={currentQuantity}
              isSingleSelect={isSingleSelect}
              onQuantityChange={newQuantity => {
                if (isSingleSelect) {
                  handleSingleSelectChange(option.id, newQuantity)
                  return
                }
                if (newQuantity > currentQuantity && isAtMax) return
                onSelectionChange(option.id, newQuantity)
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
