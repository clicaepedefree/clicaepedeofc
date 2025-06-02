export const categoriesCacheKey = (storeId: number | null) => ['stores', storeId, 'categories']

export const menuCacheKey = (storeId: number | null, menuName?: string) =>
  menuName ? ['stores', storeId, 'menus', menuName] : ['stores', storeId, 'menus']
