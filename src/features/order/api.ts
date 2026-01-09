'use server'

import {
  createOrderItemOnDb,
  createOrderOnDb,
  createOrderPaymentOnDb,
  getNextOrderDisplayIdForStore,
  updateOrderItemInventoryOnDb,
} from '@/features/order/db'
import { NewOrder } from '@/features/order/types'
import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'
import { ordersTable } from '@/services/db/schema'
import { desc, eq } from 'drizzle-orm'

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

    const updateItemsInventoryPromises = newOrder.items.map(newOrderItem =>
      updateOrderItemInventoryOnDb({
        itemId: newOrderItem.itemId,
        quantity: Number(newOrderItem.quantity),
        dbSession: tx,
      })
    )

    await Promise.all(updateItemsInventoryPromises)

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

export const listOrders = async (storeId: number) => {
  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.storeId, storeId))
    .orderBy(desc(ordersTable.createdAt))

  return orders
}
