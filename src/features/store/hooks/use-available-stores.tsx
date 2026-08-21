'use client'
import { getAvailableStores } from '@/features/store/api'
import { storesCacheKey } from '@/features/store/cache-keys'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { useEffect } from 'react'

export const useAvailableStores = () => {
  const result = useQuery({ queryKey: storesCacheKey(), queryFn: getAvailableStores })
  const [selectedStoreId, setSelectedStoreId] = useAtom(selectedStoreIdAtom)

  const selectedStoreIsAvailable = !!result.data?.some(
    store => store.id === selectedStoreId
  )

  useEffect(() => {
    if (!result.data?.length) return

    if (selectedStoreIsAvailable) return

    const firstStore = result.data?.[0]

    setSelectedStoreId(firstStore.id)
  }, [result.data, selectedStoreId, selectedStoreIsAvailable, setSelectedStoreId])

  return {
    stores: result.data,
    selectedStoreId,
    selectedStoreIsAvailable,
    isLoading: result.isLoading,
    isError: result.isError,
  }
}
