export const revenueSummaryCacheKey = (
  storeId: number | null,
  period: {
    preset: string
    startDate?: string
    endDate?: string
    timeZone?: string
  }
) => ['stores', storeId, 'revenue-summary', period]
