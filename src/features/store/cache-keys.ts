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
