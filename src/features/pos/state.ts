import { CartItem, CartSession } from '@/features/pos/types'
import { atom } from 'jotai'

export const cartSessionAtom = atom<CartSession | null>(null)
export const cartSessionItemsAtom = atom(get => get(cartSessionAtom)?.items)
export const cartSessionTotalAtom = atom(get => {
  const cartSession = get(cartSessionAtom)

  if (!cartSession || !cartSession.items?.length) return '0'

  return cartSession.items.reduce((total, item) => total + Number(item.price) * item.quantity, 0)
})

export const addItemToCartAtom = atom(null, (get, set, newItem: CartItem) => {
  const cartSession = get(cartSessionAtom)

  if (!cartSession) {
    set(cartSessionAtom, {
      startedAt: new Date(),
      items: [newItem],
    })
    return
  }

  set(cartSessionAtom, {
    ...cartSession,
    items: [...cartSession.items, newItem],
  })
})

export const clearCartAtom = atom(null, (_, set) => {
  set(cartSessionAtom, null)
})

export const removeItemFromCartAtom = atom(null, (get, set, index: number) => {
  const cartSession = get(cartSessionAtom)

  if (!cartSession || cartSession.items.length <= index) return

  const itemToRemove = cartSession.items[index]

  if (!itemToRemove) return

  set(cartSessionAtom, {
    ...cartSession,
    items: cartSession.items.filter((item, itemIndex) => {
      const isItemToRemove = item.id === itemToRemove.id && itemIndex === index
      return !isItemToRemove
    }),
  })
})

export const updateItemQuantityAtom = atom(
  null,
  (get, set, { index, quantity }: { index: number; quantity: number }) => {
    const cartSession = get(cartSessionAtom)

    if (!cartSession || cartSession.items.length <= index) return

    const itemToUpdate = cartSession.items[index]

    if (!itemToUpdate) return

    set(cartSessionAtom, {
      ...cartSession,
      items: cartSession.items.map((item, itemIndex) => {
        const isItemToUpdate = item.id === itemToUpdate.id && itemIndex === index
        return isItemToUpdate ? { ...item, quantity } : item
      }),
    })
  }
)

export const activeCounterIdAtom = atom<number | undefined>()

export const isUsingPaymentScreenAtom = atom<boolean>(false)
