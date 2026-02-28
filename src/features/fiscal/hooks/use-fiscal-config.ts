'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getFiscalConfig, getAutoEmissionMethods } from '../api'
import { fiscalConfigCacheKey, autoEmissionMethodsCacheKey } from '../cache-keys'

export const useFiscalConfig = (storeId: number | null) => {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: fiscalConfigCacheKey(storeId),
    queryFn: () => (storeId ? getFiscalConfig(storeId) : null),
    enabled: !!storeId,
    staleTime: 60 * 1000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: fiscalConfigCacheKey(storeId) })
  }

  return {
    ...query,
    invalidate,
  }
}

export const useAutoEmissionMethods = (storeId: number | null) => {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: autoEmissionMethodsCacheKey(storeId),
    queryFn: () => (storeId ? getAutoEmissionMethods(storeId) : []),
    enabled: !!storeId,
    staleTime: 60 * 1000,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: autoEmissionMethodsCacheKey(storeId) })
  }

  return {
    ...query,
    invalidate,
  }
}
