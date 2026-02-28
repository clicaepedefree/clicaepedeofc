'use server'

import {
  createOrderItemOnDb,
  createOrderItemOptionsOnDb,
  createOrderOnDb,
  createOrderPaymentOnDb,
  getNextOrderDisplayIdForStore,
  updateOrderItemInventoryOnDb,
} from '@/features/order/db'
import { NewOrder } from '@/features/order/types'
import { OrderTemplate } from '@/features/receipt/templates/order'
import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'
import { ordersTable, storesTable } from '@/services/db/schema'
import { getValueFromCurrencyString } from '@/shared/formatters/currency'
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

    const createdOrderItems = []
    for (const newOrderItem of newOrder.items) {
      const { options, ...orderItemData } = newOrderItem
      const createdOrderItem = await createOrderItemOnDb({
        newOrderItem: {
          ...orderItemData,
          orderId: createdOrder.id,
          index: orderItemData.index,
        },
        dbSession: tx,
      })

      if (options && options.length > 0) {
        await createOrderItemOptionsOnDb({
          options: options.map((opt) => ({
            ...opt,
            orderItemId: createdOrderItem.id,
          })),
          dbSession: tx,
        })
      }

      createdOrderItems.push({ ...createdOrderItem, options: options ?? [] })
    }

    const createdOrderPaymentsPromises = newOrder.payments.map(
      newOrderPayment =>
        createOrderPaymentOnDb({
          newOrderPayment: { ...newOrderPayment, orderId: createdOrder.id },
          dbSession: tx,
        })
    )

    const createdOrderPayments = await Promise.all(createdOrderPaymentsPromises)

    // Fetch store name for receipt
    const [store] = await tx
      .select({ name: storesTable.name })
      .from(storesTable)
      .where(eq(storesTable.id, newOrder.storeId))

    // Generate order receipt
    const receiptItems = createdOrderItems.map(item => ({
      itemName: item.itemName,
      quantity: Number(item.quantity),
      unitPrice: getValueFromCurrencyString(item.price),
      totalPrice: getValueFromCurrencyString(item.price) * Number(item.quantity) +
        (item.options ?? []).reduce(
          (sum, opt) => sum + getValueFromCurrencyString(opt.price ?? '0') * Number(opt.quantity),
          0
        ) * Number(item.quantity),
      options: (item.options ?? []).map(opt => ({
        optionName: opt.optionName,
        optionQuantity: Number(opt.quantity),
        optionPrice: opt.price ? getValueFromCurrencyString(opt.price) : undefined,
      })),
      comment: item.comment,
    }))

    const receiptPayments = createdOrderPayments.map(payment => ({
      method: payment.method,
      value: getValueFromCurrencyString(payment.value),
      changeFor: payment.changeFor ? getValueFromCurrencyString(payment.changeFor) : null,
    }))

    const orderReceipt = await OrderTemplate.render({
      storeName: store?.name,
      displayId: createdOrder.displayId,
      createdAt: createdOrder.createdAt,
      orderType: createdOrder.type,
      posCounterName: createdOrder.posCounterName,
      items: receiptItems,
      totalPrice: getValueFromCurrencyString(createdOrder.totalPrice),
      payments: receiptPayments,
    })

    return {
      ...createdOrder,
      items: createdOrderItems,
      payments: createdOrderPayments,
      receipt: orderReceipt,
    }
  })
}

export const listOrders = async (storeId: number) => {
  const orders = await db.query.ordersTable.findMany({
    where: eq(ordersTable.storeId, storeId),
    orderBy: [desc(ordersTable.createdAt)],
    with: {
      items: {
        with: {
          options: true,
        },
      },
      payments: true,
    },
  })

  return orders
}
