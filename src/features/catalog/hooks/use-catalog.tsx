'use client'

import { selectedStoreIdAtom } from '@/features/store/state'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { listCatalogItems } from '../api'
import { catalogCacheKey } from '../cache-keys'

export const useCatalog = ({ catalogName }: { catalogName: string }) => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  const result = useQuery({
    enabled: !!selectedStoreId,
    queryKey: catalogCacheKey(selectedStoreId, catalogName),
    queryFn: async () => {
      if (!selectedStoreId) throw new Error('No store selected')
      return listCatalogItems({ storeId: selectedStoreId })
    },
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  })

  return {
    catalogItems: result.data,
    refetch: result.refetch,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError: result.isError,
  }
}
