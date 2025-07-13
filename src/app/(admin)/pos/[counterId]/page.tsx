'use client'

import { useMenu } from '@/features/menu/hooks/use-menu'
import { CounterSelector } from '@/features/pos/components/counter-selector'
import { CloseCounterAction } from '@/features/pos/components/open-close-counter/close-counter-action'
import { OpenCounterAction } from '@/features/pos/components/open-close-counter/open-counter-action'
import { PosCart } from '@/features/pos/components/pos-cart'
import { PosMenuItemsList } from '@/features/pos/components/pos-menu-items-list'
import { PosPayments } from '@/features/pos/components/pos-payments/pos-payments'
import { useCart } from '@/features/pos/hooks/use-cart'
import { useCounters } from '@/features/pos/hooks/use-counters'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Button } from '@/shared/button'
import { dispatchToast } from '@/shared/lib/toast'
import { LoadingSpinner, PageLoadingSpinner } from '@/shared/spinner'
import { Body } from '@/shared/typography/body'
import { Headline } from '@/shared/typography/headline'
import { useAtom } from 'jotai'
import { MonitorOff, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function CounterPage({}) {
  const router = useRouter()
  const { menuItems, categories, isFetching } = useMenu({ menuName: 'POS' })
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const {
    counters,
    isLoading,
    isEnabled,
    activeCounterId,
    activeCounter,
    canOperateActiveCounter,
    isCounterOpen,
    openCounterPage,
  } = useCounters()

  const {
    isUsingPaymentScreen,
    setIsUsingPaymentScreen,
    amountPaid,
    amountLeftToPay,
  } = useCart('POS')

  const hasMenuItems = !!menuItems?.length

  useEffect(() => {
    if (isLoading || !isEnabled || !!activeCounterId) return
    dispatchToast({
      message: 'Selecione um balcão para utilizar o PDV',
      type: 'warning',
    })

    router.replace(`/pos`)
  }, [isLoading, activeCounterId])

  if (isLoading || !isEnabled || !activeCounterId || !activeCounter)
    return <PageLoadingSpinner />

  return (
    <div className="col-span-2 flex flex-col items-start gap-4 overflow-y-scroll h-full p-4">
      <div className="flex items-center justify-between w-full">
        <Headline
          variant={300}
          className="flex items-center text-nowrap gap-4 w-56"
        >
          Balcão:
          {counters && (
            <CounterSelector
              counters={counters}
              activeCounterId={activeCounterId}
              onChangeCounter={counterId => openCounterPage(counterId, true)}
            />
          )}
          {isFetching && <LoadingSpinner />}
        </Headline>
        {activeCounter.currentSession?.status === 'OPEN' && (
          <CloseCounterAction
            counter={activeCounter}
            trigger={
              <Button variant="destructive" isClickable={true}>
                <MonitorOff className="w-5 h-5" />
                Fechar caixa
              </Button>
            }
            onSuccess={() => {
              router.replace(`/pos`)
              dispatchToast({
                message: `Balcão '${activeCounter.name}' fechado com sucesso`,
                type: 'success',
              })
            }}
          />
        )}
      </div>

      {!canOperateActiveCounter && (
        <>
          <Headline variant={500}>Você não pode operar este balcão</Headline>
          <Body
            variant={300}
            fontWeight="regular"
            className="flex items-center justify-center w-fit gap-1 px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive/80"
          >
            <>
              <span className="flex items-center justify-center gap-2 font-medium">
                <User size={16} className="font-bold" />
                {activeCounter.currentSession.operatorName}
              </span>{' '}
              é o operator da sessão ativa
            </>
          </Body>
          <Body
            variant={300}
            fontWeight="regular"
            className="flex items-center justify-center w-fit gap-1 px-1.5 py-0.5 rounded-md"
          >
            Feche o caixa e inicie uma nova sessão para usar o PDV
          </Body>
        </>
      )}

      {canOperateActiveCounter && !isCounterOpen && (
        <>
          <Headline variant={500}>Caixa fechado</Headline>
          <Body variant={200} fontWeight="regular">
            Abra o caixa para iniciar uma sessão do PDV
          </Body>
          <OpenCounterAction
            counter={activeCounter}
            trigger={<Button variant="default">Abrir caixa</Button>}
            onSuccess={() => openCounterPage(activeCounter.id, true)}
          />
        </>
      )}

      {canOperateActiveCounter && isCounterOpen && (
        <div className="grid grid-cols-[1fr_1fr] lg:grid-cols-[2fr_1fr] w-full gap-4 h-[inherit] items-start overflow-y-hidden">
          {isUsingPaymentScreen && (
            <PosPayments
              onClose={() => setIsUsingPaymentScreen(false)}
              amountLeftToPay={amountLeftToPay}
              amountPaid={amountPaid}
            />
          )}
          {!isUsingPaymentScreen && (
            <PosMenuItemsList
              menuItems={menuItems ?? []}
              categories={categories ?? []}
            />
          )}
          {hasMenuItems && <PosCart key={selectedStoreId} />}
        </div>
      )}
    </div>
  )
}
