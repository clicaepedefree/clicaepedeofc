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

  useEffect(() => {
    if (selectedStoreId) return

    const firstStore = result.data?.[0]
    if (!firstStore) return

    setSelectedStoreId(firstStore.id)
  }, [result.data, selectedStoreId, setSelectedStoreId])

  return {
    stores: result.data,
    isLoading: result.isLoading,
    isError: result.isError,
  }
}
