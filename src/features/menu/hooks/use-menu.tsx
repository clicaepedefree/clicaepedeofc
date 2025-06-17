'use client'

import { selectedStoreIdAtom } from '@/features/store/state'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { uniqBy } from 'lodash'
import { useMemo } from 'react'
import { listMenuItems } from '../api'
import { menuCacheKey } from '../cache-keys'

export const useMenu = ({ menuName }: { menuName: string }) => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  const result = useQuery({
    enabled: !!selectedStoreId,
    queryKey: menuCacheKey(selectedStoreId, menuName),
    queryFn: async () => {
      if (!selectedStoreId) throw new Error('No store selected')
      return listMenuItems({ storeId: selectedStoreId })
    },
    refetchOnMount: 'always',
    refetchOnReconnect: true,
  })

  const categories = useMemo(() => {
    const allCategories = result.data?.map(itemOffering => itemOffering.category)
    const uniqueCategories = uniqBy(allCategories, 'id')
    return uniqueCategories
  }, [result.data])

  return {
    menuItems: result.data,
    categories,
    refetch: result.refetch,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError: result.isError,
  }
}
