'use client'

import { CounterCard } from '@/features/pos/components/counter-card'
import { NewCounterCard } from '@/features/pos/components/new-counter-card'
import { calculateCounterSessionSummary } from '@/features/pos/db'
import { useCounters } from '@/features/pos/hooks/use-counters'
import { selectedStoreIdAtom } from '@/features/store/state'
import { LoadingSpinner } from '@/shared/spinner'
import { Body } from '@/shared/typography/body'
import { Headline } from '@/shared/typography/headline'
import { useAtom } from 'jotai'

export default function Page() {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const {
    counters,
    refetch,
    isLoading: isLoadingCounters,
    openCounterPage: onOpenCounter,
  } = useCounters()

  if (isLoadingCounters || !selectedStoreId) return <LoadingSpinner />

  const hasCounters = !!counters?.length

  return (
    <>
      <div className="bg-white border-b-2 p-4 space-y-2 ">
        <Headline variant={300}>
          {hasCounters ? 'Selecione um caixa' : 'Crie seu primeiro caixa'}
        </Headline>
        <Body fontWeight="light" highlight="secondary" variant={100}>
          {hasCounters
            ? 'Selecione um caixa para abrir o ponto de venda'
            : 'Define o nome do seu primeiro caixa abaixo'}
        </Body>
        <button
          onClick={async () => {
            const summary = await calculateCounterSessionSummary(37)
            console.log(summary)
          }}
        >
          Get summary
        </button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4 items-center justify-items-center overflow-y-hidden p-6">
        {counters?.map(counter => (
          <CounterCard
            key={counter.id}
            counter={counter}
            onCounterStateChange={refetch}
            onOpenCounter={() => onOpenCounter(counter.id)}
          />
        ))}
        <NewCounterCard
          key={selectedStoreId}
          initialIsCreating={!hasCounters}
        />
      </div>
    </>
  )
}
