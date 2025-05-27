'use client'
import { listCounters } from '@/features/pos/api'
import { countersCacheKey } from '@/features/pos/cache-keys'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { useParams } from 'next/navigation'

export const useCounters = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { counterId } = useParams<{ counterId?: string }>()

  const result = useQuery({
    enabled: !!selectedStoreId,
    queryKey: countersCacheKey(selectedStoreId),
    queryFn: async () => {
      if (!selectedStoreId) throw new Error('No store selected')
      return listCounters(selectedStoreId)
    },
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  })

  return {
    counters: result.data,
    refetch: result.refetch,
    isLoading: result.isLoading,
    isError: result.isError,
    activeCounterId: counterId ? Number(counterId) : undefined,
  }
}
