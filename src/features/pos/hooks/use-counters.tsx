'use client'
import { listCounters } from '@/features/pos/api'
import { countersCacheKey } from '@/features/pos/cache-keys'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { useParams } from 'next/navigation'
import { useMemo } from 'react'

export const useCounters = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { counterId } = useParams<{ counterId?: string }>()

  const isEnabled = !!selectedStoreId

  const result = useQuery({
    enabled: isEnabled,
    queryKey: countersCacheKey(selectedStoreId),
    queryFn: async () => {
      if (!isEnabled) throw new Error('No store selected')
      return listCounters(selectedStoreId)
    },
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  })

  const counters = result.data

  const activeCounterId = counterId ? Number(counterId) : undefined

  const activeCounter = useMemo(
    () => counters?.find(counter => counter.id === activeCounterId),
    [counters, activeCounterId]
  )

  return {
    counters,
    refetch: result.refetch,
    isLoading: result.isLoading,
    isEnabled,
    isError: result.isError,
    activeCounterId: activeCounter?.id,
    activeCounterName: activeCounter?.name,
  }
}
