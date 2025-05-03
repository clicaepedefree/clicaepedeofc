'use client'
import { useQuery } from '@tanstack/react-query'
import { listCategories } from '../db'
import { useAtom } from 'jotai'
import { selectedStoreIdAtom } from '@/features/store/state'
import { categoriesCacheKey } from '../cache-keys'

export const useCategories = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const result = useQuery({
    enabled: !!selectedStoreId,
    queryKey: categoriesCacheKey(),
    queryFn: async () => {
      if (!selectedStoreId) throw new Error('No store selected')
      return listCategories(selectedStoreId)
    },
  })
  console.log('result', result)

  return {
    categories: result.data,
    refetch: result.refetch,
    isLoading: result.isLoading,
    isError: result.isError,
  }
}
