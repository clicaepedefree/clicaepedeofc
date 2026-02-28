export const fiscalConfigCacheKey = (storeId: number | null) =>
  storeId ? ['stores', storeId, 'fiscal-config'] : ['fiscal-config']

export const serviceInvoicesCacheKey = (storeId: number | null, orderId?: number) =>
  orderId
    ? ['stores', storeId, 'service-invoices', 'orders', orderId]
    : ['stores', storeId, 'service-invoices']

export const autoEmissionMethodsCacheKey = (storeId: number | null) =>
  storeId ? ['stores', storeId, 'auto-emission-methods'] : ['auto-emission-methods']
