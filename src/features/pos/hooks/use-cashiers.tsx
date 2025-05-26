'use client'
import { listCashiers } from '@/features/pos/api'
import { cashiersCacheKey } from '@/features/pos/cache-keys'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useUrl } from '@/shared/hooks/use-url'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { useEffect } from 'react'

export const useCashiers = () => {
  const { updateUrlParams, getUrlParam } = useUrl()
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  const result = useQuery({
    enabled: !!selectedStoreId,
    queryKey: cashiersCacheKey(selectedStoreId),
    queryFn: async () => {
      if (!selectedStoreId) throw new Error('No store selected')
      return listCashiers(selectedStoreId)
    },
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  })

  const updateActiveCashierId = (cashierId?: number) => {
    updateUrlParams({
      cashierId: cashierId ? String(cashierId) : undefined,
    })
  }

  const activeCashierIdParam = getUrlParam('cashierId')
  const activeCashierId = activeCashierIdParam ? Number(activeCashierIdParam) : undefined

  const cashiers = result.data

  useEffect(() => {
    if (!selectedStoreId || !activeCashierId || result.isLoading) return

    const activeCashier = cashiers?.find(cashier => cashier.id === activeCashierId)

    if (!activeCashier)
      updateUrlParams({
        cashierId: undefined,
      })
  }, [cashiers, result.isLoading, selectedStoreId])

  return {
    cashiers: result.data,
    refetch: result.refetch,
    isLoading: result.isLoading,
    isError: result.isError,
    activeCashierId,
    updateActiveCashierId,
  }
}
