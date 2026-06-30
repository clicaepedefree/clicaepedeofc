'use server'

import {
  checkStockAvailability,
  addOrderAuditNoteOnDb,
  createOrderAuditEventOnDb,
  createOrderItemOnDb,
  createOrderItemOptionsOnDb,
  createOrderOnDb,
  createOrderPaymentOnDb,
  getNextOrderDisplayIdForStore,
  updateOrderItemInventoryOnDb,
  transitionOrderOnDb,
} from '@/features/order/db'
import {
  OrderTransitionAction,
  orderTransitionActions,
  toOrderAuditEventDto,
} from './audit-policy'
import { NewOrder } from '@/features/order/types'
import { OrderTemplate } from '@/features/receipt/templates/order'
import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'
import {
  ordersTable,
  orderAuditEventsTable,
  storesTable,
  userStorePermissionsTable,
  usersTable,
} from '@/services/db/schema'
import { requireAuth } from '@/services/auth'
import { OutOfStockError } from '@/shared/errors/out-of-stock-error'
import { getValueFromCurrencyString } from '@/shared/formatters/currency'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'

export const createOrder = async (newOrder: NewOrder) => {
  const { user } = await validateUserPermissionsForStore(newOrder.storeId, 'admin')

  return await db.transaction(async tx => {
    // Check stock availability for all items before creating order
    const itemsToCheck = newOrder.items.map(item => ({
      itemId: item.itemId,
      quantity: Number(item.quantity),
    }))

    const outOfStockItems = await checkStockAvailability({
      storeId: newOrder.storeId,
      items: itemsToCheck,
      dbSession: tx,
    })

    if (outOfStockItems.length > 0) {
      throw new OutOfStockError(outOfStockItems)
    }

    const nextOrderDisplayId = await getNextOrderDisplayIdForStore({
      storeId: newOrder.storeId,
      dbSession: tx,
    })

    const createdOrder = await createOrderOnDb({
      newOrder: { ...newOrder, displayId: nextOrderDisplayId },
      dbSession: tx,
    })

    await createOrderAuditEventOnDb({
      dbSession: tx,
      event: {
        orderId: createdOrder.id,
        storeId: createdOrder.storeId,
        eventType: 'order_created',
        fromStatus: null,
        toStatus: createdOrder.status,
        actorType: 'store',
        actorUserId: user.id,
        origin: 'POS',
        requestId: crypto.randomUUID(),
        metadata: {
          salesChannel: createdOrder.salesChannel,
          orderType: createdOrder.type,
          displayId: createdOrder.displayId,
        },
      },
    })

    const updateItemsInventoryPromises = newOrder.items.map(newOrderItem =>
      updateOrderItemInventoryOnDb({
        itemId: newOrderItem.itemId,
        storeId: newOrder.storeId,
        quantity: Number(newOrderItem.quantity),
        dbSession: tx,
      })
    )

    const inventoryUpdates = await Promise.all(updateItemsInventoryPromises)

    if (inventoryUpdates.some(wasUpdated => !wasUpdated)) {
      const currentOutOfStockItems = await checkStockAvailability({
        storeId: newOrder.storeId,
        items: itemsToCheck,
        dbSession: tx,
      })

      throw new OutOfStockError(
        currentOutOfStockItems.length > 0
          ? currentOutOfStockItems
          : itemsToCheck.map(item => ({
              itemId: item.itemId,
              name: 'Item indisponivel',
              requestedQty: item.quantity,
              availableQty: 0,
            }))
      )
    }

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

export const listOrders = async (storeId: number): Promise<any[]> => {
  await validateUserPermissionsForStore(storeId, 'admin')

  const orders = await db.query.ordersTable.findMany({
    where: eq(ordersTable.storeId, storeId),
    orderBy: [desc(ordersTable.createdAt)],
    limit: 200,
    with: {
      items: {
        with: {
          options: true,
        },
      },
      payments: true,
      auditEvents: { orderBy: [asc(orderAuditEventsTable.createdAt)] },
    },
  })

  const actorUserIds = [
    ...new Set(
      orders.flatMap(order =>
        order.auditEvents
          .map(event => event.actorUserId)
          .filter((userId): userId is string => !!userId)
      )
    ),
  ]
  const actors = actorUserIds.length
    ? await db
        .select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(inArray(usersTable.id, actorUserIds))
    : []
  const actorNames = new Map(
    actors.map(actor => [actor.id, actor.name || 'Equipe da loja'])
  )

  return orders.map(order => ({
    id: order.id,
    displayId: order.displayId,
    status: order.status,
    salesChannel: order.salesChannel,
    type: order.type,
    totalPrice: order.totalPrice,
    customerName: order.customerName,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    items: order.items.map(item => ({
      id: item.id,
      itemName: item.itemName,
      quantity: item.quantity,
      price: item.price,
      comment: item.comment,
      options: item.options.map(option => ({
        id: option.id,
        optionName: option.optionName,
        quantity: option.quantity,
        price: option.price,
      })),
    })),
    payments: order.payments.map(payment => ({
      id: payment.id,
      method: payment.method,
      type: payment.type,
      value: payment.value,
      cardBrand: payment.cardBrand,
      changeFor: payment.changeFor,
    })),
    auditEvents: order.auditEvents.map(event => ({
      ...toOrderAuditEventDto(event),
      actorName:
        event.actorType === 'customer'
          ? 'Cliente'
          : event.actorType === 'system' || event.actorType === null
            ? 'Sistema'
            : event.actorUserId
              ? actorNames.get(event.actorUserId) ?? 'Equipe da loja'
              : 'Equipe da loja',
    })),
  }))
}

export const transitionOrderStatus = async (input: {
  orderId: number
  storeId: number
  action: OrderTransitionAction
  reason?: string
}) => {
  if (!orderTransitionActions.includes(input.action)) throw new Error('Acao invalida.')
  const { user } = await validateUserPermissionsForStore(input.storeId, 'admin')
  return db.transaction(tx =>
    transitionOrderOnDb({
      ...input,
      actorUserId: user.id,
      requestId: crypto.randomUUID(),
      dbSession: tx,
    })
  )
}

export const addOrderAuditNote = async (input: {
  orderId: number
  storeId: number
  reason: string
}) => {
  const { user } = await validateUserPermissionsForStore(input.storeId, 'admin')
  return db.transaction(tx =>
    addOrderAuditNoteOnDb({
      ...input,
      actorUserId: user.id,
      requestId: crypto.randomUUID(),
      dbSession: tx,
    })
  )
}

/**
 * Generates a receipt for an existing order.
 * Used for reprinting order receipts.
 */
/**
 * Validates stock availability for cart items before payment.
 * Returns out-of-stock items if any, or empty array if all items are available.
 */
export const validateCartStock = async (params: {
  storeId: number
  items: { itemId: number; quantity: number }[]
}) => {
  await validateUserPermissionsForStore(params.storeId, 'admin')

  const outOfStockItems = await checkStockAvailability({
    storeId: params.storeId,
    items: params.items,
    dbSession: db,
  })

  return outOfStockItems
}

export const generateOrderReceipt = async (orderId: number) => {
  const user = await requireAuth()
  const [authorizedOrder] = await db
    .select({ id: ordersTable.id, storeId: ordersTable.storeId })
    .from(ordersTable)
    .innerJoin(
      userStorePermissionsTable,
      and(
        eq(userStorePermissionsTable.storeId, ordersTable.storeId),
        eq(userStorePermissionsTable.userId, user.id),
        eq(userStorePermissionsTable.role, 'admin'),
        sql`${userStorePermissionsTable.revokedAt} is null`
      )
    )
    .innerJoin(
      usersTable,
      and(eq(usersTable.id, user.id), eq(usersTable.status, 'active'))
    )
    .where(eq(ordersTable.id, orderId))
    .limit(1)

  if (!authorizedOrder) throw new Error('Pedido nao encontrado')

  const order = await db.query.ordersTable.findFirst({
    where: and(
      eq(ordersTable.id, authorizedOrder.id),
      eq(ordersTable.storeId, authorizedOrder.storeId)
    ),
    with: {
      items: {
        with: {
          options: true,
        },
      },
      payments: true,
    },
  })

  if (!order) {
    throw new Error('Pedido não encontrado')
  }

  // Fetch store name for receipt header
  const [store] = await db
    .select({ name: storesTable.name })
    .from(storesTable)
    .where(eq(storesTable.id, order.storeId))

  // Transform order items to receipt format
  const receiptItems = order.items.map(item => ({
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

  // Transform order payments to receipt format
  const receiptPayments = order.payments.map(payment => ({
    method: payment.method,
    value: getValueFromCurrencyString(payment.value),
    changeFor: payment.changeFor ? getValueFromCurrencyString(payment.changeFor) : null,
  }))

  // Generate receipt SVG
  const receiptSvg = await OrderTemplate.render({
    storeName: store?.name,
    displayId: order.displayId,
    createdAt: order.createdAt,
    orderType: order.type,
    posCounterName: order.posCounterName,
    items: receiptItems,
    totalPrice: getValueFromCurrencyString(order.totalPrice),
    payments: receiptPayments,
  })

  return {
    receipt: receiptSvg,
    displayId: order.displayId,
  }
}
