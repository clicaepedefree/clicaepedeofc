'use server'

import {
  createOrderItemOnDb,
  createOrderOnDb,
  createOrderPaymentOnDb,
  getNextOrderDisplayIdForStore,
} from '@/features/order/db'
import { NewOrder } from '@/features/order/types'
import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'

export const createOrder = async (newOrder: NewOrder) => {
  await validateUserPermissionsForStore(newOrder.storeId, 'admin')

  return await db.transaction(async tx => {
    const nextOrderDisplayId = await getNextOrderDisplayIdForStore({
      storeId: newOrder.storeId,
      dbSession: tx,
    })

    const createdOrder = await createOrderOnDb({
      newOrder: { ...newOrder, displayId: nextOrderDisplayId },
      dbSession: tx,
    })

    const createdOrderItemsPromises = newOrder.items.map(newOrderItem =>
      createOrderItemOnDb({
        newOrderItem: {
          ...newOrderItem,
          orderId: createdOrder.id,
          index: newOrderItem.index,
        },
        dbSession: tx,
      })
    )

    const createdOrderItems = await Promise.all(createdOrderItemsPromises)

    const createdOrderPaymentsPromises = newOrder.payments.map(
      newOrderPayment =>
        createOrderPaymentOnDb({
          newOrderPayment: { ...newOrderPayment, orderId: createdOrder.id },
          dbSession: tx,
        })
    )

    const createdOrderPayments = await Promise.all(createdOrderPaymentsPromises)
    return {
      ...createdOrder,
      items: createdOrderItems,
      payments: createdOrderPayments,
    }
  })
}
