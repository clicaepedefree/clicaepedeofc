'use client'

import { Button } from '@/shared/button'
import { cn } from '@/shared/lib/utils'
import { ArrowDown, ArrowUp } from 'lucide-react'

type ReorderButtonsProps = {
  onMoveUp?: () => void
  onMoveDown?: () => void
  disabledUp?: boolean
  disabledDown?: boolean
  layout?: 'vertical' | 'horizontal'
  className?: string
}

export const ReorderButtons = ({
  onMoveUp,
  onMoveDown,
  disabledUp = false,
  disabledDown = false,
  layout = 'vertical',
  className,
}: ReorderButtonsProps) => {
  return (
    <div
      className={cn(
        'flex gap-0.5',
        layout === 'vertical' ? 'flex-col' : 'flex-row',
        className
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onMoveUp}
        disabled={disabledUp || !onMoveUp}
      >
        <ArrowUp size={14} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onMoveDown}
        disabled={disabledDown || !onMoveDown}
      >
        <ArrowDown size={14} />
      </Button>
    </div>
  )
}
