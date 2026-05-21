'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getIFoodConnectionStatus } from '../api'

export function useIFoodConnection(storeId: number) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ifood-connection', storeId],
    queryFn: () => getIFoodConnectionStatus(storeId),
    retry: 1,
  })

  useEffect(() => {
    refetch()
  }, [refetch])

  return {
    connection: data,
    isLoading,
    error,
    refetch,
  }
}
