import { createOrder } from '@/features/order/api'
import { SalesChannel } from '@/features/order/types'
import {
  addItemToCartAtom,
  cartSessionItemsAtom,
  cartSessionTotalAtom,
  clearCartAtom,
  removeItemFromCartAtom,
  updateItemQuantityAtom,
} from '@/features/pos/state'
import { selectedStoreIdAtom } from '@/features/store/state'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { dispatchToast } from '@/shared/lib/toast'
import { useMutation } from '@tanstack/react-query'
import { useAtom } from 'jotai'
import { useEffect } from 'react'

type CreateOrderParams = {
  counterId: number
  counterName: string
}

export const useCart = (salesChannel: SalesChannel) => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const [cartSessionItems] = useAtom(cartSessionItemsAtom)
  const [cartSessionTotal] = useAtom(cartSessionTotalAtom)
  const [, addItemToCart] = useAtom(addItemToCartAtom)
  const [, clearCart] = useAtom(clearCartAtom)
  const [, removeItemFromCart] = useAtom(removeItemFromCartAtom)
  const [, updateItemQuantity] = useAtom(updateItemQuantityAtom)

  useEffect(() => {
    if (!selectedStoreId) return
    clearCart()
  }, [selectedStoreId, clearCart])

  const createOrderMutation = useMutation({
    mutationFn: async ({ counterId, counterName }: CreateOrderParams) => {
      if (!selectedStoreId || !cartSessionItems) return

      const orderItems = cartSessionItems.map((cartItem, index) => ({
        index,
        itemId: cartItem.itemId,
        quantity: cartItem.quantity.toString(),
        price: cartItem.price,
        originalPrice: cartItem.originalPrice,
        itemName: cartItem.name,
        categoryName: cartItem.category.name,
        categoryId: cartItem.category.id,
        externalCode: cartItem.externalCode,
        ean: cartItem.ean,
      }))

      const newOrder = await createOrder({
        storeId: selectedStoreId!,
        items: orderItems,
        totalPrice: formatValueToCurrency({ value: cartSessionTotal }),
        salesChannel: salesChannel,
        type: 'INDOOR',
        status: 'COMPLETED',
        posCounterId: counterId,
        posCounterName: counterName,
      })
      return newOrder
    },
    onError: () => {
      dispatchToast({ message: `Erro ao criar pedido`, type: 'error' })
    },
    onSuccess: newOrder => {
      dispatchToast({ message: `Pedido '#${newOrder?.displayId}' criado com sucesso`, type: 'success' })
      clearCart()
    },
  })

  return {
    cartSessionItems,
    cartSessionTotal,
    addItemToCart,
    clearCart,
    removeItemFromCart,
    updateItemQuantity,
    createOrder: createOrderMutation.mutateAsync,
  }
}
