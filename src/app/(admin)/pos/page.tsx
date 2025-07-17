'use client'

import { CounterCard } from '@/features/pos/components/counter-card'
import { NewCounterCard } from '@/features/pos/components/new-counter-card'
import { useCounters } from '@/features/pos/hooks/use-counters'
import { selectedStoreIdAtom } from '@/features/store/state'
import { LoadingSpinner } from '@/shared/spinner'
import { Body } from '@/shared/typography/body'
import { Headline } from '@/shared/typography/headline'
import { useAtom } from 'jotai'
import { useRef } from 'react'
import { useReactToPrint } from 'react-to-print'

export default function Page() {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const {
    counters,
    refetch,
    isLoading: isLoadingCounters,
    openCounterPage: onOpenCounter,
  } = useCounters()
  const contentRef = useRef<HTMLDivElement>(null)
  const content = (
    <div className="hidden h-0 w-0 print:block" ref={contentRef}>
      \n ABERTURA DE CAIXA \n\n************************************\n\nData
      Abertura: 10/07/2025 14:43\nResponsável: Gustavo Almeida\nCaixa.....:
      1752169381\n\n\nAbertura do caixa.............R$ 10,00\n\n\n
      _________________________\nAssinatura\n
    </div>
  )

  const printContent = useReactToPrint({
    contentRef,
  })

  if (isLoadingCounters || !selectedStoreId) return <LoadingSpinner />

  const hasCounters = !!counters?.length

  return (
    <>
      <div className="bg-white border-b-2 p-4 space-y-2 ">
        <Headline variant={300}>
          {hasCounters ? 'Selecione um balcão' : 'Crie seu primeiro balcão'}
        </Headline>
        <Body fontWeight="light" highlight="secondary" variant={100}>
          {hasCounters
            ? 'Selecione um balcão para abrir o ponto de venda'
            : 'Define o nome do seu primeiro balcão abaixo'}
        </Body>
        {content}
        <button onClick={printContent}>Print</button>
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
