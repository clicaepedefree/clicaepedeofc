'use client'
import { useQuery } from '@tanstack/react-query'
import { getAvailableStores } from '../api'
import { useEffect } from 'react'
import { selectedStoreIdAtom } from '../state'
import { useAtom } from 'jotai'

export const useAvailableStores = () => {
  const result = useQuery({ queryKey: ['stores'], queryFn: getAvailableStores })
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
