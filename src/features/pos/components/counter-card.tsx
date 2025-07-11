'use client'

import { Counter } from '@/features/pos/types'
import { Button } from '@/shared/button'
import { cn } from '@/shared/lib/utils'
import { Body } from '@/shared/typography/body'
import { Headline } from '@/shared/typography/headline'
import { useAuth } from '@clerk/nextjs'
import { Check, Monitor, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { CounterActionsDropdownMenu } from './counter-actions-dropdown-menu'
import { OpenCounterAction } from './open-close-counter/open-counter-action'

export const CounterCard = ({
  counter,
  onCounterStateChange,
}: {
  counter: Counter
  onCounterStateChange?: () => void
}) => {
  const router = useRouter()
  const { sessionClaims } = useAuth()

  const counterPosPage = `/pos/${counter.id}`

  const onOpenCounter = () => router.push(counterPosPage)

  if (!counter.isInService)
    return (
      <OpenCounterAction
        counter={counter}
        trigger={<BaseCounterCard counter={counter} />}
        onSuccess={onOpenCounter}
      />
    )

  return (
    <CounterActionsDropdownMenu
      counter={counter}
      trigger={<BaseCounterCard counter={counter} />}
      onOpenPos={onOpenCounter}
      onClosed={onCounterStateChange}
      canUsePos={
        counter.currentSession?.operatorId === sessionClaims?.metadata.userId
      }
    />
  )
}

const BaseCounterCard = ({
  counter,
  ...props
}: {
  counter: Counter
} & React.ComponentProps<'button'>) => {
  return (
    <Button
      variant="ghost"
      {...props}
      className={cn(
        'flex flex-col gap-2 justify-center items-center min-h-32 p-2 border-2 border-l-8 rounded-lg bg-white hover:scale-105 hover:shadow-lg cursor-pointer min-w-68',
        {
          'border-green-700/80': !counter.isInService,
          'border-destructive/60': counter.isInService,
        }
      )}
    >
      <Monitor
        size={20}
        className={cn({
          'text-green-700/80': !counter.isInService,
          'text-destructive/80': counter.isInService,
        })}
      />
      <Headline variant={400} className="text-center">
        {counter.name}
      </Headline>
      <Body
        variant={300}
        fontWeight="regular"
        className={cn(
          'flex items-center justify-center gap-2 w-fit px-1.5 py-0.5 rounded-md',
          {
            'bg-green-700/10 text-green-700/80': !counter.isInService,
            'bg-destructive/10 text-destructive/80': counter.isInService,
          }
        )}
      >
        {!counter.isInService || !counter.currentSession ? (
          <>
            <Check size={14} />
            Livre
          </>
        ) : (
          <>
            <User size={16} />
            {counter.currentSession.operatorName}
          </>
        )}
      </Body>
    </Button>
  )
}
