'use client'
import { listCounters } from '@/features/pos/api'
import { countersCacheKey } from '@/features/pos/cache-keys'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useUrl } from '@/shared/hooks/use-url'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { useEffect } from 'react'

export const useCounters = () => {
  const { updateUrlParams, getUrlParam } = useUrl()
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

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

  const updateActiveCounterId = (counterId?: number) => {
    updateUrlParams({
      counterId: counterId ? String(counterId) : undefined,
    })
  }

  const activeCounterIdParam = getUrlParam('counterId')
  const activeCounterId = activeCounterIdParam ? Number(activeCounterIdParam) : undefined

  const counters = result.data

  useEffect(() => {
    if (!selectedStoreId || !activeCounterId || result.isLoading) return

    const activeCounter = counters?.find(counter => counter.id === activeCounterId)

    if (!activeCounter)
      updateUrlParams({
        counterId: undefined,
      })
  }, [counters, result.isLoading, selectedStoreId])

  return {
    counters: result.data,
    refetch: result.refetch,
    isLoading: result.isLoading,
    isError: result.isError,
    activeCounterId,
    updateActiveCounterId,
  }
}
