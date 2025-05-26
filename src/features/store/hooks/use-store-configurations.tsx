'use client'

import { getStoreConfigurations } from '@/features/store/api'
import { storeConfigurationsCacheKey } from '@/features/store/cache-keys'
import { selectedStoreIdAtom } from '@/features/store/state'
import { StoreConfiguration } from '@/features/store/types'
import { isServer } from '@/shared/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import groupBy from 'lodash/groupBy'
import toPairs from 'lodash/toPairs'
import { useMemo } from 'react'

type StoreConfigurationsByCategory = {
  category: string
  configurations: StoreConfiguration[]
}
export const useStoreConfigurations = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  const result = useQuery({
    enabled: !!selectedStoreId && !isServer,
    queryKey: storeConfigurationsCacheKey(selectedStoreId),
    queryFn: async () => {
      if (!selectedStoreId) throw new Error('No store selected')
      return getStoreConfigurations(selectedStoreId)
    },
  })

  const configurations = result.data

  const configurationsByCategory = useMemo(() => {
    const configurationsByCategoryMapping = groupBy(configurations, 'category')
    const categoryAndConfigurationsPairs = toPairs(configurationsByCategoryMapping)

    return categoryAndConfigurationsPairs.reduce<StoreConfigurationsByCategory[]>(
      (accConfigurationsByCategory, [category, configurations]) => {
        accConfigurationsByCategory.push({
          category,
          configurations,
        })
        return accConfigurationsByCategory
      },
      [] as StoreConfigurationsByCategory[]
    )
  }, [configurations])

  return {
    configurations,
    configurationsByCategory,
    isLoading: result.isLoading,
    isError: result.isError,
  }
}
