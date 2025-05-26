export const categoriesCacheKey = (storeId: number | null) => ['stores', storeId, 'categories']

export const catalogCacheKey = (storeId: number | null, catalogName?: string) =>
  catalogName ? ['stores', storeId, 'catalogs', catalogName] : ['stores', storeId, 'catalogs']
