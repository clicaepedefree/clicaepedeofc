'use client'

import { useCounters } from '@/features/pos/hooks/use-counters'
import { selectedStoreIdAtom } from '@/features/store/state'
import { cn } from '@/shared/lib/utils'
import { LoadingSpinner } from '@/shared/spinner'
import { Body } from '@/shared/typography/body'
import { Headline } from '@/shared/typography/headline'
import { useAtom } from 'jotai'
import { Check, Monitor, User } from 'lucide-react'

export default function Page() {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { counters, isLoading: isLoadingCounters } = useCounters()

  if (isLoadingCounters || !selectedStoreId) return <LoadingSpinner />

  return (
    <>
      <div className="bg-white border-b-2 p-4 space-y-2 ">
        <Headline variant={300}>Selecione um balcão</Headline>
        <Body fontWeight="light" highlight="secondary" variant={100}>
          Selecione um balcão para abrir o ponto de venda
        </Body>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4 items-center justify-items-center overflow-y-hidden p-6">
        {counters?.map(counter => (
          <div
            key={counter.id}
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
            <Headline variant={400}>{counter.name}</Headline>
            <Body
              variant={300}
              fontWeight="regular"
              className={cn('flex items-center justify-center gap-2 w-fit px-1.5 py-0.5 rounded-md', {
                'bg-green-700/10 text-green-700/80': counter.isAvailable,
                'bg-destructive/10 text-destructive/80': !counter.isAvailable,
              })}
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
        ))}
      </div>
    </>
  )
}

const CounterCard = ({ counter }: { counter: Counter }) => {
  return (
    <div
      key={counter.id}
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
        className={cn({ 'text-green-700/80': counter.isAvailable, 'text-destructive/80': !counter.isAvailable })}
      />
      <Headline variant={400}>{counter.name}</Headline>
      <Body
        variant={300}
        fontWeight="regular"
        className={cn('flex items-center justify-center gap-2 w-fit px-1.5 py-0.5 rounded-md', {
          'bg-green-700/10 text-green-700/80': counter.isAvailable,
          'bg-destructive/10 text-destructive/80': !counter.isAvailable,
        })}
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
  )
}
