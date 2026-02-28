import { CartItem, CartItemOption, CartPayment, CartSession } from '@/features/pos/types'
import { OutOfStockItem } from '@/shared/errors/out-of-stock-error'
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

export const cartSessionAtom = atomWithStorage<CartSession | null>('posCartSession', null)
export const cartSessionItemsAtom = atom(get => get(cartSessionAtom)?.items)
export const cartSessionPaymentsAtom = atom(get => get(cartSessionAtom)?.payments)

export const cartSessionTotalAtom = atom(get => {
  const cartSession = get(cartSessionAtom)

  if (!cartSession || !cartSession.items?.length) return 0

  return cartSession.items.reduce((total, item) => {
    const itemBasePrice = Number(item.price) * item.quantity
    const optionsPrice = (item.selectedOptions ?? []).reduce(
      (optTotal, opt) => optTotal + opt.price * opt.quantity,
      0
    ) * item.quantity
    return total + itemBasePrice + optionsPrice
  }, 0)
})

export const addItemToCartAtom = atom(null, (get, set, newItem: CartItem) => {
  const cartSession = get(cartSessionAtom)

  const lightItem: CartItem = { ...newItem, optionGroups: [] }

  if (!cartSession) {
    set(cartSessionAtom, {
      startedAt: new Date(),
      items: [lightItem],
    })
    return
  }

  set(cartSessionAtom, {
    ...cartSession,
    items: [...cartSession.items, lightItem],
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

export const updateCartItemAtom = atom(
  null,
  (
    get,
    set,
    {
      index,
      selectedOptions,
      comment,
    }: { index: number; selectedOptions: CartItemOption[]; comment?: string }
  ) => {
    const cartSession = get(cartSessionAtom)

    if (!cartSession || cartSession.items.length <= index) return

    set(cartSessionAtom, {
      ...cartSession,
      items: cartSession.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, selectedOptions, comment } : item
      ),
    })
  }
)

export const activeCounterIdAtom = atom<number | undefined>()

export const isUsingPaymentScreenAtom = atom<boolean>(false)

export const addPaymentAtom = atom(null, (get, set, payment: CartPayment) => {
  const cartSession = get(cartSessionAtom)

  if (!cartSession) return

  const { payments = [] } = cartSession

  set(cartSessionAtom, {
    ...cartSession,
    payments: [...payments, payment],
  })
})

export const resetPaymentsAtom = atom(null, (get, set) => {
  const cartSession = get(cartSessionAtom)
  if (!cartSession) return

  set(cartSessionAtom, {
    ...cartSession,
    payments: [],
  })
})

export const amountPaidAtom = atom(get => {
  const cartSession = get(cartSessionAtom)

  if (!cartSession || !cartSession.payments?.length) return 0

  return cartSession.payments.reduce((amountPaid, payment) => amountPaid + Number(payment.value), 0)
})

export const amountLeftToPayAtom = atom(get => {
  const cartSessionTotal = get(cartSessionTotalAtom)
  const amountPaid = get(amountPaidAtom)

  return cartSessionTotal - amountPaid
})

// Stock validation state
export const stockValidationErrorsAtom = atom<OutOfStockItem[]>([])

export const hasStockErrorsAtom = atom(get => {
  const stockErrors = get(stockValidationErrorsAtom)
  return stockErrors.length > 0
})

export const clearStockErrorsAtom = atom(null, (_, set) => {
  set(stockValidationErrorsAtom, [])
})
