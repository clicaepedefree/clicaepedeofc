import { atom } from 'jotai'
import { CartItem, CartSession } from './types'
export const cartSessionAtom = atom<CartSession | null>(null)
export const cartSessionItemsAtom = atom(get => get(cartSessionAtom)?.items)
export const cartSessionTotalAtom = atom(get => get(cartSessionAtom)?.total ?? 0)

export const addItemToCartAtom = atom(null, (get, set, newItem: CartItem) => {
  const cartSession = get(cartSessionAtom)

  if (!cartSession) {
    set(cartSessionAtom, {
      startedAt: new Date(),
      items: [newItem],
      total: Number(newItem.price),
    })
    return
  }

  set(cartSessionAtom, {
    ...cartSession,
    items: [...cartSession.items, newItem],
    total: cartSession.total + Number(newItem.price),
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
    total: cartSession.total - Number(itemToRemove.price),
  })
})
