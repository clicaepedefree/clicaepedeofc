'use client'

import { getRevenueSummary } from '@/features/reports/api'
import {
  reportTimeZone,
  resolveReportPeriod,
  type ReportPeriodSelection,
} from '@/features/reports/form-validation/report-period'
import { useAvailableStores } from '@/features/store/hooks/use-available-stores'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useQuery } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { useMemo } from 'react'
import { revenueSummaryCacheKey } from '../cache-keys'

export const useRevenueSummary = (periodSelection: ReportPeriodSelection) => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const { stores } = useAvailableStores()
  const selectedStore = stores?.find(store => store.id === selectedStoreId)
  const isEnabled = !!selectedStoreId
  const period = useMemo(
    () =>
      resolveReportPeriod(
        periodSelection,
        new Date(),
        selectedStore?.timezone ?? reportTimeZone
      ),
    [periodSelection, selectedStore?.timezone]
  )
  const canFetch = isEnabled && period.isRangeValid

  const result = useQuery({
    queryKey: revenueSummaryCacheKey(selectedStoreId, {
      preset: period.preset,
      startDate: period.startDate,
      endDate: period.endDate,
      timeZone: period.timeZone,
    }),
    queryFn: () => {
      if (!canFetch) throw new Error('No valid store or period selected')

      return getRevenueSummary(selectedStoreId, {
        startDate: period.startDate,
        endDate: period.endDate,
        periodPreset: period.preset,
      })
    },
    enabled: canFetch,
  })

  return {
    revenueSummary: result.data,
    isLoading: result.isLoading,
    isEnabled,
    period,
  }
}
