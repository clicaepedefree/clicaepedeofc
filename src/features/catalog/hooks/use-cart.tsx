import {
  addItemToCartAtom,
  cartSessionItemsAtom,
  cartSessionTotalAtom,
  clearCartAtom,
  removeItemFromCartAtom,
  updateItemQuantityAtom,
} from '@/features/catalog/state'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useAtom } from 'jotai'
import { useEffect } from 'react'

export const useCart = () => {
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

  return {
    cartSessionItems,
    cartSessionTotal,
    addItemToCart,
    clearCart,
    removeItemFromCart,
    updateItemQuantity,
  }
}
