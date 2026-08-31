'use client'
import { listCounters } from '@/features/pos/api'
import { countersCacheKey } from '@/features/pos/cache-keys'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { useParams, useRouter } from 'next/navigation'
import { useMemo } from 'react'

export const useCounters = () => {
  const router = useRouter()
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { counterId } = useParams<{ counterId?: string }>()

  const queryClient = useQueryClient()

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

  const counters = result.data?.counters
  const currentUserId = result.data?.currentUserId ?? null

  const activeCounterId = counterId ? Number(counterId) : undefined

  const activeCounter = useMemo(
    () => counters?.find(counter => counter.id === activeCounterId),
    [counters, activeCounterId]
  )
  const activeCounterSession = activeCounter?.currentSession

  const canOperateActiveCounter =
    activeCounterSession?.status !== 'OPEN' ||
    currentUserId === activeCounterSession?.operatorId

  const isCounterOpen = activeCounterSession?.status === 'OPEN'

  const openCounterPage = (counterId: number, useReplace: boolean = false) => {
    queryClient.invalidateQueries({
      queryKey: countersCacheKey(selectedStoreId),
    })
    const routerMethod = useReplace ? router.replace : router.push
    routerMethod(`/pos/${counterId}`)
  }

  return {
    counters,
    refetch: result.refetch,
    isLoading: result.isLoading,
    isEnabled,
    isError: result.isError,
    activeCounter,
    activeCounterId: activeCounter?.id,
    activeCounterName: activeCounter?.name,
    currentUserId,
    canOperateActiveCounter,
    isCounterOpen,
    openCounterPage,
  }
}
