'use client'

import { getStoreConfigurations } from '@/features/store/api'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import keyBy from 'lodash/keyBy'

export const useStoreConfigurations = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)

  const result = useQuery({
    queryKey: ['stores', 'configurations', selectedStoreId],
    enabled: !!selectedStoreId,
    queryFn: selectedStoreId ? () => getStoreConfigurations(selectedStoreId) : undefined,
  })

  const configurations = result.data

  const configurationsByCategory = keyBy(configurations, 'category')

  return {
    configurations,
    configurationsByCategory,
    isLoading: result.isLoading,
    isError: result.isError,
  }
}
