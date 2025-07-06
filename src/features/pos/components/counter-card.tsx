'use client'

import { Counter } from '@/features/pos/types'
import { cn } from '@/shared/lib/utils'
import { Body } from '@/shared/typography/body'
import { Headline } from '@/shared/typography/headline'
import { Check, Monitor, User } from 'lucide-react'
import Link from 'next/link'

export const CounterCard = ({ counter }: { counter: Counter }) => {
  return (
    <Link href={`/pos/${counter.id}`}>
      <div
        className={cn(
          'flex flex-col gap-2 justify-center items-center min-h-32 p-2 border-2 border-l-8 rounded-lg bg-white hover:scale-105 hover:shadow-lg cursor-pointer min-w-68',
          {
            'border-green-700/80': counter.isAvailable,
            'border-destructive/60': !counter.isAvailable,
          }
        )}
      >
        <Monitor
          size={20}
          className={cn({
            'text-green-700/80': counter.isAvailable,
            'text-destructive/80': !counter.isAvailable,
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
              'bg-green-700/10 text-green-700/80': counter.isAvailable,
              'bg-destructive/10 text-destructive/80': !counter.isAvailable,
            }
          )}
        >
          {counter.isAvailable ? (
            <>
              <Check size={14} />
              Livre
            </>
          ) : (
            <>
              <User size={16} />
              Em atendimento
            </>
          )}
        </Body>
      </div>
    </Link>
  )
}
