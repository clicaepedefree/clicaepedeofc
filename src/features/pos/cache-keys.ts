export const countersCacheKey = (storeId: number | null) => [
  'stores',
  storeId,
  'counters',
]
export const counterSessionsCacheKey = (
  storeId: number | null,
  sessionId: number | null
) => ['stores', storeId, 'counters', 'sessions', sessionId]
