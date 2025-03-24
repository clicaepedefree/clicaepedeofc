export const storesCacheKey = () => ['stores']

export const storeConfigurationsCacheKey = (storeId: number | null) => ['stores', storeId, 'configurations']
