'use client'

import { OptionGroupWithOptions } from '@/features/option-groups/types'
import { cn } from '@/shared/lib/utils'
import { SmallText } from '@/shared/typography/small-text'
import { Check } from 'lucide-react'

type GroupSelections = Record<number, Record<number, number>>

type OptionGroupProgressIndicatorProps = {
  groups: OptionGroupWithOptions[]
  selections: GroupSelections
  className?: string
}

const isGroupComplete = (
  group: OptionGroupWithOptions,
  selections: GroupSelections
): boolean => {
  const groupSelections = selections[group.id] ?? {}
  const totalSelected = Object.values(groupSelections).reduce(
    (sum, qty) => sum + qty,
    0
  )
  return totalSelected >= group.minQuantity && totalSelected <= group.maxQuantity
}

export const OptionGroupProgressIndicator = ({
  groups,
  selections,
  className,
}: OptionGroupProgressIndicatorProps) => {
  if (groups.length <= 1) return null

  return (
    <div
      className={cn(
        'flex items-center gap-1 overflow-x-auto pb-2 px-4 scrollbar-thin',
        className
      )}
    >
      {groups.map((group, index) => {
        const isComplete = isGroupComplete(group, selections)
        const isLast = index === groups.length - 1

        return (
          <div key={group.id} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  'flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium transition-colors',
                  isComplete
                    ? 'bg-green-500 text-white'
                    : 'bg-amber-100 text-amber-700 border border-amber-300'
                )}
              >
                {isComplete ? (
                  <Check size={14} strokeWidth={3} />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <SmallText
                className={cn(
                  'max-w-16 truncate text-center',
                  isComplete ? 'text-green-600' : 'text-muted-foreground'
                )}
              >
                {group.name}
              </SmallText>
            </div>
            {!isLast && (
              <div
                className={cn(
                  'w-6 h-0.5 mx-1 mt-[-1rem]',
                  isComplete ? 'bg-green-500' : 'bg-border'
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
