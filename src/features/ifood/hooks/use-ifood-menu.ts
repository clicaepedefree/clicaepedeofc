'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchIFoodMenu, getLocalMenuItems } from '../api'

export function useIFoodMenu(storeId: number | null, enabled = true) {
  const canLoad = !!storeId && enabled

  const ifoodMenuQuery = useQuery({
    queryKey: ['ifood-menu', storeId],
    queryFn: () => fetchIFoodMenu(storeId!),
    enabled: canLoad,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  })

  const localItemsQuery = useQuery({
    queryKey: ['local-menu-items', storeId],
    queryFn: () => getLocalMenuItems(storeId!),
    enabled: canLoad,
    staleTime: 1000 * 60 * 5,
  })

  return {
    ifoodMenu: ifoodMenuQuery.data,
    localItems: localItemsQuery.data,
    isLoadingIFood: ifoodMenuQuery.isLoading,
    isLoadingLocal: localItemsQuery.isLoading,
    isLoading: ifoodMenuQuery.isLoading || localItemsQuery.isLoading,
    error: ifoodMenuQuery.error || localItemsQuery.error,
    refetch: () => {
      ifoodMenuQuery.refetch()
      localItemsQuery.refetch()
    },
  }
}
