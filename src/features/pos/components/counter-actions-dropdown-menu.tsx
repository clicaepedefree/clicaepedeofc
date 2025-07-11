'use client'

import { Counter } from '@/features/pos/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/dropdown-menu'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/tooltip'
import { MonitorOff, SquareArrowOutUpRight } from 'lucide-react'
import { CloseCounterAction } from './open-close-counter/close-counter-action'

export const CounterActionsDropdownMenu = ({
  counter,
  trigger,
  onOpenPos,
  onClosed,
  canUsePos = true,
}: {
  counter: Counter
  trigger: React.ReactNode
  onOpenPos?(): void
  onClosed?(): void
  canUsePos?: boolean
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
        {trigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        <Tooltip open={canUsePos ? false : undefined}>
          <TooltipTrigger className="w-full">
            <DropdownMenuItem onSelect={onOpenPos} disabled={!canUsePos}>
              <SquareArrowOutUpRight className="mr-2 h-4 w-4" />
              Abrir PDV
            </DropdownMenuItem>
            <TooltipContent variant="error">
              Você não é o operador da sessão ativa.
              <br />
              Feche o caixa e inicie uma nova sessão para usar o PDV
            </TooltipContent>
          </TooltipTrigger>
        </Tooltip>
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
