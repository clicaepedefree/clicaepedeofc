export const ordersCacheKey = (storeId: number | null) => [
  'stores',
  storeId,
  'orders',
]
