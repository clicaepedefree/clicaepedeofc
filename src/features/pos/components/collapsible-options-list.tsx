'use client'

import { CartItemOption } from '@/features/pos/types'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/collapsible'
import { cn } from '@/shared/lib/utils'
import { OptionItemLine } from '@/shared/option-item-line'
import { SmallText } from '@/shared/typography/small-text'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

type CollapsibleOptionsListProps = {
  options: CartItemOption[]
  className?: string
}

const MAX_VISIBLE_OPTIONS = 3

export const CollapsibleOptionsList = ({
  options,
  className,
}: CollapsibleOptionsListProps) => {
  const [isExpanded, setIsExpanded] = useState(false)

  if (options.length === 0) return null

  const shouldCollapse = options.length > MAX_VISIBLE_OPTIONS
  const visibleOptions = options.slice(0, MAX_VISIBLE_OPTIONS)
  const hiddenOptions = options.slice(MAX_VISIBLE_OPTIONS)
  const hiddenCount = hiddenOptions.length

  // Group options by optionGroupName
  const groupOptions = (optionsList: CartItemOption[]) =>
    optionsList.reduce<Record<string, CartItemOption[]>>(
      (groups, opt) => {
        const groupName = opt.optionGroupName
        if (!groups[groupName]) {
          groups[groupName] = []
        }
        groups[groupName].push(opt)
        return groups
      },
      {}
    )

  const groupedVisibleOptions = groupOptions(visibleOptions)
  const groupNames = Object.keys(groupedVisibleOptions)
  const hasMultipleGroups = groupNames.length > 1

  const renderOptionsList = (optionsList: CartItemOption[], grouped: Record<string, CartItemOption[]>, showGroupHeaders: boolean) => {
    if (showGroupHeaders) {
      return Object.entries(grouped).map(([groupName, groupOpts]) => (
        <div key={groupName} className="space-y-0.5">
          <SmallText className="text-muted-foreground font-medium">
            {groupName}:
          </SmallText>
          {groupOpts.map((opt, idx) => (
            <OptionItemLine
              key={idx}
              name={opt.optionName}
              quantity={opt.quantity}
              price={opt.price}
              indented
            />
          ))}
        </div>
      ))
    }

    return optionsList.map((opt, idx) => (
      <OptionItemLine
        key={idx}
        name={opt.optionName}
        quantity={opt.quantity}
        price={opt.price}
      />
    ))
  }

  if (!shouldCollapse) {
    return (
      <div className={cn('space-y-0.5 mt-1', className)}>
        {renderOptionsList(options, groupOptions(options), hasMultipleGroups)}
      </div>
    )
  }

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={setIsExpanded}
      className={cn('space-y-0.5 mt-1', className)}
    >
      <div className="space-y-0.5">
        {renderOptionsList(visibleOptions, groupedVisibleOptions, hasMultipleGroups)}
      </div>

      <CollapsibleContent className="space-y-0.5 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        {hiddenOptions.map((opt, idx) => (
          <OptionItemLine
            key={idx}
            name={opt.optionName}
            quantity={opt.quantity}
            price={opt.price}
            indented={hasMultipleGroups}
          />
        ))}
      </CollapsibleContent>

      <CollapsibleTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-0.5 transition-colors',
            isExpanded
              ? 'text-muted-foreground hover:text-foreground'
              : 'text-primary hover:text-primary/80'
          )}
        >
          <SmallText className={isExpanded ? 'text-muted-foreground' : 'text-primary font-medium'}>
            {isExpanded ? 'Mostrar menos' : `+${hiddenCount} mais`}
          </SmallText>
          <ChevronDown
            size={14}
            className={cn(
              'transition-transform duration-200',
              isExpanded && 'rotate-180'
            )}
          />
        </button>
      </CollapsibleTrigger>
    </Collapsible>
  )
}
