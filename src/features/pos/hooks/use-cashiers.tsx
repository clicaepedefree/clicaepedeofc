'use client'
import { listCashiers } from '@/features/pos/api'
import { cashiersCacheKey } from '@/features/pos/cache-keys'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'

export const useCashiers = () => {
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

  return {
    cashiers: result.data,
    refetch: result.refetch,
    isLoading: result.isLoading,
    isError: result.isError,
  }
}
