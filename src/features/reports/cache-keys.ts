export const revenueSummaryCacheKey = (
  storeId: number | null,
  startDate: string,
  endDate: string
) => ['stores', storeId, 'revenue-summary', { startDate, endDate }]
