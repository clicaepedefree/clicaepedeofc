import {
  addItemToCartAtom,
  cartSessionItemsAtom,
  clearCartAtom,
  removeItemFromCartAtom,
} from '@/features/catalog/state'
import { selectedStoreIdAtom } from '@/features/store/state'
import { useAtom } from 'jotai'
import { useEffect } from 'react'

export const useCart = () => {
  const [selectedStoreId] = useAtom(selectedStoreIdAtom)
  const [cartSessionItems] = useAtom(cartSessionItemsAtom)
  const [, addItemToCart] = useAtom(addItemToCartAtom)
  const [, clearCart] = useAtom(clearCartAtom)
  const [, removeItemFromCart] = useAtom(removeItemFromCartAtom)

  useEffect(() => {
    clearCart()
  }, [selectedStoreId])

  return {
    cartSessionItems,
    addItemToCart,
    clearCart,
    removeItemFromCart,
  }
}
