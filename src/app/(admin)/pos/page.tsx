'use client'

import { CreateCounterForm } from '@/features/pos/components/create-counter-form'
import { useCounters } from '@/features/pos/hooks/use-counters'
import { Counter } from '@/features/pos/types'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Button } from '@/shared/button'
import { cn } from '@/shared/lib/utils'
import { LoadingSpinner } from '@/shared/spinner'
import { Body } from '@/shared/typography/body'
import { Headline } from '@/shared/typography/headline'
import { useClickAway } from '@uidotdev/usehooks'
import { useAtom } from 'jotai'
import { Check, Monitor, Plus, User } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

export default function Page() {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { counters, isLoading: isLoadingCounters } = useCounters()

  if (isLoadingCounters || !selectedStoreId) return <LoadingSpinner />

  const hasCounters = !!counters?.length

  return (
    <>
      <div className="bg-white border-b-2 p-4 space-y-2 ">
        <Headline variant={300}>{hasCounters ? 'Selecione um balcão' : 'Crie seu primeiro balcão'}</Headline>
        <Body fontWeight="light" highlight="secondary" variant={100}>
          {hasCounters
            ? 'Selecione um balcão para abrir o ponto de venda'
            : 'Define o nome do seu primeiro balcão abaixo'}
        </Body>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4 items-center justify-items-center overflow-y-hidden p-6">
        {counters?.map(counter => <CounterCard key={counter.id} counter={counter} />)}
        {<NewCounterCard initialIsCreating={!hasCounters} />}
      </div>
    </>
  )
}

const NewCounterCard = ({ initialIsCreating = false }: { initialIsCreating?: boolean }) => {
  const [isCreating, setIsCreating] = useState(initialIsCreating)
  const ref = useClickAway<HTMLDivElement>(() => !initialIsCreating && setIsCreating(false))

  if (!isCreating)
    return (
      <Button
        variant="outline"
        className="text-primary h-10 hover:bg-primary/5 hover:text-primary border-2 hover:border-primary border-dashed min-h-32 min-w-68"
        onClick={() => setIsCreating(true)}
      >
        <Plus className="mr-1 h-4 w-4" />
        Adicionar Balcão
      </Button>
    )

  return (
    <div
      ref={ref}
      className={cn(
        'flex flex-col gap-2 justify-center items-center min-h-32 p-2 border-2 rounded-lg bg-white cursor-pointer min-w-68 border-l-8'
      )}
    >
      <Monitor size={20} />
      <CreateCounterForm onSuccess={() => setIsCreating(false)} />
    </div>
  )
}

const CounterCard = ({ counter }: { counter: Counter }) => {
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
          className={cn({ 'text-green-700/80': counter.isAvailable, 'text-destructive/80': !counter.isAvailable })}
        />
        <Headline variant={400} className="text-center">
          {counter.name}
        </Headline>
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
    </Link>
  )
}
