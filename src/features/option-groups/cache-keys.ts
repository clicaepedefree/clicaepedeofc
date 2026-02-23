export const optionGroupsCacheKey = (storeId: number | null) =>
  ['stores', storeId, 'option-groups']

export const itemOfferingOptionGroupsCacheKey = (
  storeId: number | null,
  itemOfferingId?: number
) =>
  itemOfferingId
    ? ['stores', storeId, 'option-groups', 'item-offering', itemOfferingId]
    : ['stores', storeId, 'option-groups']
