'use client'

import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { getIFoodConnectionStatus } from '../api'

export function useIFoodConnection(storeId: number) {
  const query = useQuery({
    queryKey: ['ifood-connection', storeId],
    queryFn: () => getIFoodConnectionStatus(storeId),
    retry: 1,
  })

  useEffect(() => {
    query.refetch()
  }, [])

  return {
    connection: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
