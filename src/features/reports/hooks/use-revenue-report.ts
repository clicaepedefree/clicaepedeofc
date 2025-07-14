'use client'

import { getRevenueSummary } from '@/features/reports/api'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { revenueSummaryCacheKey } from '../cache-keys'
import { ReportPeriod } from '../form-validation/report-period'

export const useRevenueSummary = (period: ReportPeriod) => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const isEnabled = !!selectedStoreId

  const dates = getPeriodDates(period)

  const result = useQuery({
    queryKey: revenueSummaryCacheKey(
      selectedStoreId,
      dates.startDate,
      dates.endDate
    ),
    queryFn: () => {
      if (!isEnabled) throw new Error('No store selected')
      return getRevenueSummary(selectedStoreId, dates.startDate, dates.endDate)
    },
    enabled: isEnabled,
  })

  return {
    revenueSummary: result.data,
    isLoading: result.isLoading,
    isEnabled,
    dates,
  }
}

const getPeriodDates = (period: ReportPeriod) => {
  const now = new Date()
  const startDate = new Date()
  const endDate = new Date()

  switch (period) {
    case 'TODAY':
      break

    case 'YESTERDAY':
      startDate.setDate(now.getDate() - 1)
      endDate.setDate(now.getDate() - 1)
      break

    case 'LAST_7_DAYS':
      startDate.setDate(now.getDate() - 6)
      break

    case 'LAST_15_DAYS':
      startDate.setDate(now.getDate() - 14)
      break

    case 'LAST_30_DAYS':
      startDate.setDate(now.getDate() - 29)
      break

    case 'LAST_60_DAYS':
      startDate.setDate(now.getDate() - 59)
      break

    case 'LAST_90_DAYS':
      startDate.setDate(now.getDate() - 89)
      break

    case 'THIS_WEEK':
      const startOfWeek = now.getDate() - now.getDay()
      startDate.setDate(startOfWeek)
      break

    case 'LAST_WEEK':
      const lastWeekStart = now.getDate() - now.getDay() - 7
      const lastWeekEnd = now.getDate() - now.getDay() - 1
      startDate.setDate(lastWeekStart)
      endDate.setDate(lastWeekEnd)
      break

    case 'THIS_MONTH':
      startDate.setDate(1)
      break

    case 'LAST_MONTH':
      startDate.setMonth(now.getMonth() - 1, 1)
      endDate.setMonth(now.getMonth(), 0)
      break

    case 'THIS_YEAR':
      startDate.setMonth(0, 1)
      break

    default:
      throw new Error(`Unsupported period: ${period}`)
  }

  return {
    startDate: dayjs(startDate).format('YYYY-MM-DD'),
    endDate: dayjs(endDate).format('YYYY-MM-DD'),
  }
}
