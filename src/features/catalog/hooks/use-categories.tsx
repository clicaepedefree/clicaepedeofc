'use client'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { listCategories } from '../api'
import { categoriesCacheKey } from '../cache-keys'

export const useCategories = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  const result = useQuery({
    enabled: !!selectedStoreId,
    queryKey: categoriesCacheKey(selectedStoreId),
    queryFn: async () => {
      if (!selectedStoreId) throw new Error('No store selected')
      return listCategories({ storeId: selectedStoreId, includeProducts: true })
    },
  })

  return {
    categories: result.data,
    refetch: result.refetch,
    isLoading: result.isLoading,
    isError: result.isError,
  }
}
