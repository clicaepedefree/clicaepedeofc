'use client'

import { CounterCard } from '@/features/pos/components/counter-card'
import { NewCounterCard } from '@/features/pos/components/new-counter-card'
import { useCounters } from '@/features/pos/hooks/use-counters'
import { selectedStoreIdAtom } from '@/features/store/state'
import { PageHeaderBlock } from '@/shared/blocks/page-header-block'
import { LoadingSpinner } from '@/shared/spinner'
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
      <PageHeaderBlock
        title={hasCounters ? 'Selecione um caixa' : 'Crie seu primeiro caixa'}
        subtitle={
          hasCounters
            ? 'Selecione um caixa para abrir o ponto de venda'
            : 'Define o nome do seu primeiro caixa abaixo'
        }
      />
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
