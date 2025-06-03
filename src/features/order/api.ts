'use server'

import { createOrderItemOnDb, createOrderOnDb, getNextOrderDisplayIdForStore } from '@/features/order/db'
import { NewOrder } from '@/features/order/types'
import { db } from '@/services/db'

export const createOrder = async (newOrder: NewOrder) => {
  return await db.transaction(async tx => {
    const nextOrderDisplayId = await getNextOrderDisplayIdForStore({ storeId: newOrder.storeId, dbSession: tx })

    const createdOrder = await createOrderOnDb({
      newOrder: { ...newOrder, displayId: nextOrderDisplayId },
      dbSession: tx,
    })

    const createdOrderItemsPromises = newOrder.items.map(newOrderItem =>
      createOrderItemOnDb({
        newOrderItem: { ...newOrderItem, orderId: createdOrder.id, index: newOrderItem.index },
        dbSession: tx,
      })
    )

    const createdOrderItems = await Promise.all(createdOrderItemsPromises)
    return { ...createdOrder, items: createdOrderItems }
  })
}
