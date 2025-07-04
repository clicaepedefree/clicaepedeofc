'use client'

import { useMenu } from '@/features/menu/hooks/use-menu'
import { PosCart } from '@/features/pos/components/pos-cart'
import { PosMenuItemsList } from '@/features/pos/components/pos-menu-items-list'
import { PosPayments } from '@/features/pos/components/pos-payments/pos-payments'
import { useCart } from '@/features/pos/hooks/use-cart'
import { useCounters } from '@/features/pos/hooks/use-counters'
import { selectedStoreIdAtom } from '@/features/store/state'
import { dispatchToast } from '@/shared/lib/toast'
import { LoadingSpinner, PageLoadingSpinner } from '@/shared/spinner'
import { Headline } from '@/shared/typography/headline'
import { useAtom } from 'jotai'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function CounterPage({}) {
  const router = useRouter()
  const { menuItems, categories, isFetching } = useMenu({ menuName: 'POS' })
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { isLoading, isEnabled, activeCounterId } = useCounters()

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

  if (isLoading || !isEnabled || !activeCounterId) return <PageLoadingSpinner />

  return (
    <div className="col-span-2 flex flex-col items-start gap-4 overflow-y-scroll h-full p-4">
      <Headline
        variant={300}
        className="flex items-center justify-center gap-2"
      >
        Ponto de Venda {isFetching && <LoadingSpinner />}
      </Headline>

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
    </div>
  )
}
