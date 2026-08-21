export const storesCacheKey = () => ['stores']

export const storeConfigurationsCacheKey = (storeId: number | null) => ['stores', storeId, 'configurations']

export const storeDeliveryConfigurationCacheKey = (storeId: number | null) => [
  'stores',
  storeId,
  'delivery-configuration',
]

export const storeOperationConfigurationCacheKey = (storeId: number | null) => [
  'stores',
  storeId,
  'operation-configuration',
]

export const storeUsersCacheKey = (
  storeId: number | null,
  page: number,
  search: string,
  status: string,
  role: string
) => ['stores', storeId, 'users', page, search, status, role]
