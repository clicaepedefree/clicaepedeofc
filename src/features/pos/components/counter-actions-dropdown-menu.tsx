'use client'

import { Counter } from '@/features/pos/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/dropdown-menu'

import { MonitorOff, SquareArrowOutUpRight } from 'lucide-react'
import { CloseCounterAction } from './open-close-counter/close-counter-action'

export const CounterActionsDropdownMenu = ({
  counter,
  trigger,
  onOpenPos,
  onClosed,
}: {
  counter: Counter
  trigger: React.ReactNode
  onOpenPos?(): void
  onClosed?(): void
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        <DropdownMenuItem onSelect={onOpenPos}>
          <SquareArrowOutUpRight className="mr-2 h-4 w-4" />
          Abrir PDV
        </DropdownMenuItem>
        <CloseCounterAction
          counter={counter}
          trigger={
            <DropdownMenuItem
              variant="destructive"
              onSelect={e => e.preventDefault()}
            >
              <MonitorOff className="mr-2 h-4 w-4" />
              Fechar caixa
            </DropdownMenuItem>
          }
          onSuccess={onClosed}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
