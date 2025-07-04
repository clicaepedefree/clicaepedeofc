import { createOrder } from '@/features/order/api'
import { SalesChannel } from '@/features/order/types'
import {
  addItemToCartAtom,
  addPaymentAtom,
  amountLeftToPayAtom,
  amountPaidAtom,
  cartSessionItemsAtom,
  cartSessionPaymentsAtom,
  cartSessionTotalAtom,
  clearCartAtom,
  isUsingPaymentScreenAtom,
  removeItemFromCartAtom,
  resetPaymentsAtom,
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
  const [cartSessionPayments] = useAtom(cartSessionPaymentsAtom)
  const [cartSessionTotal] = useAtom(cartSessionTotalAtom)
  const [, addItemToCart] = useAtom(addItemToCartAtom)
  const [, clearCart] = useAtom(clearCartAtom)
  const [, removeItemFromCart] = useAtom(removeItemFromCartAtom)
  const [, updateItemQuantity] = useAtom(updateItemQuantityAtom)
  const [, addPayment] = useAtom(addPaymentAtom)
  const [, resetPayments] = useAtom(resetPaymentsAtom)
  const [isUsingPaymentScreen, setIsUsingPaymentScreen] = useAtom(
    isUsingPaymentScreenAtom
  )
  const [amountPaid] = useAtom(amountPaidAtom)
  const [amountLeftToPay] = useAtom(amountLeftToPayAtom)

  useEffect(() => {
    if (!selectedStoreId || !cartSessionItems?.length) return

    const cartItemsIndexesToRemove = cartSessionItems
      .filter(cartItem => cartItem.storeId !== selectedStoreId)
      .map((_, index) => index)
      .reverse()

    cartItemsIndexesToRemove.forEach(index => removeItemFromCart(index))
  }, [selectedStoreId])

  useEffect(() => {
    if (cartSessionItems?.length) return

    if (cartSessionPayments?.length) {
      resetPayments()
    }
    if (isUsingPaymentScreen) {
      setIsUsingPaymentScreen(false)
    }
  }, [cartSessionItems])

  const createOrderMutation = useMutation({
    mutationFn: async ({ counterId, counterName }: CreateOrderParams) => {
      if (
        !selectedStoreId ||
        !cartSessionItems?.length ||
        !cartSessionPayments?.length
      )
        return

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

      const orderPayments = cartSessionPayments.map(payment => ({
        type: payment.type,
        value: payment.value,
        method: payment.method,
        changeFor: payment.changeFor,
        cardBrand: payment.cardBrand,
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
        payments: orderPayments,
      })

      return newOrder
    },
    onError: () => {
      dispatchToast({ message: `Erro ao criar pedido`, type: 'error' })
    },
    onSuccess: newOrder => {
      dispatchToast({
        message: `Pedido '#${newOrder?.displayId}' criado com sucesso`,
        type: 'success',
      })
      clearCart()
    },
  })

  return {
    cartSessionItems,
    cartSessionTotal,
    cartSessionPayments,
    addItemToCart,
    clearCart,
    removeItemFromCart,
    updateItemQuantity,
    addPayment,
    createOrder: createOrderMutation.mutateAsync,
    isUsingPaymentScreen,
    setIsUsingPaymentScreen,
    amountPaid,
    amountLeftToPay,
  }
}
