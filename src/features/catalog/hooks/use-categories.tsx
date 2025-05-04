'use client'
import { useQuery } from '@tanstack/react-query'
import { listCategories } from '../api'
import { useAtom } from 'jotai'
import { selectedStoreIdAtom } from '@/features/store/state'
import { categoriesCacheKey } from '../cache-keys'

export const useCategories = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  const result = useQuery({
    enabled: !!selectedStoreId,
    queryKey: categoriesCacheKey(selectedStoreId),
    queryFn: async () => {
      if (!selectedStoreId) throw new Error('No store selected')
      return listCategories(selectedStoreId)
    },
  })

  return {
    categories: result.data,
    refetch: result.refetch,
    isLoading: result.isLoading,
    isError: result.isError,
  }
}
