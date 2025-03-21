'use client'

import { getStoreConfigurations } from '@/features/store/api'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import groupBy from 'lodash/groupBy'
import toPairs from 'lodash/toPairs'
import { StoreConfiguration } from '../types'
import { useMemo } from 'react'

type StoreConfigurationsByCategory = {
  category: string
  configurations: StoreConfiguration[]
}
export const useStoreConfigurations = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  const result = useQuery({
    queryKey: ['stores', 'configurations', selectedStoreId],
    enabled: !!selectedStoreId,
    queryFn: selectedStoreId ? () => getStoreConfigurations(selectedStoreId) : undefined,
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
