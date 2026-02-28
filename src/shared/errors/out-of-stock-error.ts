export type OutOfStockItem = {
  itemId: number
  name: string
  requestedQty: number
  availableQty: number | null
}

export class OutOfStockError extends Error {
  type: 'OUT_OF_STOCK' = 'OUT_OF_STOCK'
  items: OutOfStockItem[]

  constructor(items: OutOfStockItem[]) {
    const itemNames = items.map(item => item.name).join(', ')
    super(`OUT_OF_STOCK: Os seguintes itens estão indisponíveis: ${itemNames}`)
    this.items = items
    this.name = 'OutOfStockError'
  }
}

export const isOutOfStockError = (error: Error): error is OutOfStockError => {
  return error instanceof OutOfStockError || error.message?.startsWith('OUT_OF_STOCK:')
}
