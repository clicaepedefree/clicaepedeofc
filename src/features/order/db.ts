'use server'

import { itemsTable, SelectItem } from '@/services/db/schema/items'
import {
  InsertOrderItemOption,
  orderItemOptionsTable,
} from '@/services/db/schema/order-item-options'
import {
  InsertOrderItem,
  orderItemsTable,
} from '@/services/db/schema/order-items'
import {
  InsertOrderPayment,
  orderPaymentsTable,
} from '@/services/db/schema/order-payments'
import {
  InsertOrder,
  ordersTable,
  type SelectOrder,
} from '@/services/db/schema/orders'
import {
  InsertOrderAuditEvent,
  orderAuditEventsTable,
} from '@/services/db/schema/order-audit-events'
import { publicOrderSubmissionsTable } from '@/services/db/schema/public-order-submissions'
import { publicOrderEventsTable } from '@/services/db/schema/public-order-events'
import { storesTable } from '@/services/db/schema/stores'
import { whatsappBotAssistantConfigsTable } from '@/services/db/schema/whatsapp-bot-assistant-configs'
import { enqueueWhatsappTransactionalMessage } from '@/features/whatsapp-bot/db'
import { buildOrderBenefitWhatsappNotifications } from './benefit-notifications'
import {
  OrderTransitionAction,
  requireAuditReason,
  resolveOrderTransition,
  sanitizeOrderAuditMetadata,
} from './audit-policy'
import {
  buildOrderStatusNotificationEventId,
  buildOrderStatusWhatsappNotification,
  parseOrderStatusNotificationTemplateOverrides,
  type OrderStatusNotificationStatus,
} from './status-notifications'
import { buildOrderTransitionPersistenceFields } from './transition-fields'
import { OutOfStockItem } from '@/shared/errors/out-of-stock-error'
import { DbSession } from '@/services/db/types'
import { decrementColumnValue } from '@/services/db/utils/decrement-column-value'
import { and, count, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm'

export const getNextOrderDisplayIdForStore = async ({
  storeId,
  dbSession,
}: {
  storeId: number
  dbSession: DbSession
}) => {
  const [{ totalOrders: totalOrdersForTheDay }] = await dbSession
    .select({ totalOrders: count(ordersTable.id) })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.storeId, storeId),
        eq(
          sql`date(timezone('America/Sao_Paulo', ${ordersTable.createdAt}))`,
          sql`date(timezone('America/Sao_Paulo', now()))`
        )
      )
    )

  const nextDisplayIdAsNumber = totalOrdersForTheDay + 1
  return nextDisplayIdAsNumber.toString()
}

export const createOrderOnDb = async ({
  newOrder,
  dbSession,
}: {
  newOrder: InsertOrder
  dbSession: DbSession
}) => {
  const [createdOrder] = await dbSession
    .insert(ordersTable)
    .values(newOrder)
    .returning()

  return createdOrder
}

export const createOrderAuditEventOnDb = async ({
  event,
  dbSession,
}: {
  event: InsertOrderAuditEvent
  dbSession: DbSession
}) => {
  const [createdEvent] = await dbSession
    .insert(orderAuditEventsTable)
    .values({ ...event, metadata: sanitizeOrderAuditMetadata(event.metadata) })
    .returning()
  return createdEvent
}

export const enqueueOrderStatusWhatsappNotificationOnDb = async ({
  order,
  fromStatus,
  toStatus,
  reason,
  dbSession,
}: {
  order: Pick<
    SelectOrder,
    'id' | 'displayId' | 'storeId' | 'type' | 'salesChannel' | 'customerPhone'
  >
  fromStatus?: OrderStatusNotificationStatus | null
  toStatus: OrderStatusNotificationStatus
  reason?: string | null
  dbSession: DbSession
}) => {
  if (
    order.salesChannel !== 'DIGITAL_MENU' ||
    !order.customerPhone ||
    (order.type !== 'DELIVERY' && order.type !== 'TAKEOUT')
  ) {
    return null
  }

  const [store] = await dbSession
    .select({ name: storesTable.name })
    .from(storesTable)
    .where(eq(storesTable.id, order.storeId))
    .limit(1)
  const [assistantConfig] = await dbSession
    .select({ metadata: whatsappBotAssistantConfigsTable.metadata })
    .from(whatsappBotAssistantConfigsTable)
    .where(eq(whatsappBotAssistantConfigsTable.storeId, order.storeId))
    .limit(1)

  const notification = buildOrderStatusWhatsappNotification({
    storeName: store?.name ?? 'a loja',
    orderDisplayId: order.displayId,
    orderType: order.type,
    fromStatus,
    toStatus,
    reason,
    templateOverrides: parseOrderStatusNotificationTemplateOverrides(
      assistantConfig?.metadata
    ),
  })

  if (!notification.shouldNotify) return null

  try {
    return await enqueueWhatsappTransactionalMessage({
      dbSession,
      storeId: order.storeId,
      eventType: 'order_status',
      eventId: buildOrderStatusNotificationEventId({
        orderId: order.id,
        status: notification.eventStatus,
      }),
      recipientPhone: order.customerPhone,
      text: notification.text,
      orderId: order.id,
      payload: {
        source: 'order_status_transition',
        orderDisplayId: order.displayId,
        orderType: order.type,
        fromStatus: fromStatus ?? null,
        toStatus: notification.eventStatus,
        statusTitle: notification.title,
        statusMessage: notification.message,
        reason: reason ?? null,
      },
    })
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'WHATSAPP_TRANSACTIONAL_INVALID_RECIPIENT'
    ) {
      return null
    }
    throw error
  }
}

export const enqueueOrderBenefitWhatsappNotificationsOnDb = async ({
  order,
  dbSession,
}: {
  order: Pick<
    SelectOrder,
    'id' | 'displayId' | 'storeId' | 'status' | 'customerPhone' | 'snapshot'
  >
  dbSession: DbSession
}) => {
  if (!order.customerPhone || order.status !== 'COMPLETED') return []

  const [store] = await dbSession
    .select({ name: storesTable.name, subdomain: storesTable.subdomain })
    .from(storesTable)
    .where(eq(storesTable.id, order.storeId))
    .limit(1)

  if (!store) return []

  const notifications = buildOrderBenefitWhatsappNotifications({
    storeName: store.name,
    storeSubdomain: store.subdomain,
    orderId: order.id,
    orderDisplayId: order.displayId,
    customerPhone: order.customerPhone,
    orderStatus: order.status,
    snapshot: order.snapshot,
  })

  const results = []
  for (const notification of notifications) {
    results.push(
      await enqueueWhatsappTransactionalMessage({
        dbSession,
        storeId: order.storeId,
        eventType: notification.eventType,
        eventId: notification.eventId,
        recipientPhone: order.customerPhone,
        text: notification.text,
        orderId: order.id,
        payload: notification.payload,
      })
    )
  }

  return results
}

export const transitionOrderOnDb = async ({
  orderId,
  storeId,
  action,
  reason,
  estimatedMinutes,
  actorUserId,
  requestId,
  dbSession,
}: {
  orderId: number
  storeId: number
  action: OrderTransitionAction
  reason?: string
  estimatedMinutes?: number
  actorUserId: string
  requestId: string
  dbSession: DbSession
}) => {
  const [order] = await dbSession
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.storeId, storeId)))
    .limit(1)
    .for('update')

  if (!order) throw new Error('Pedido nao encontrado.')

  const transition = resolveOrderTransition(order.status, action, reason)
  const now = new Date()
  const {
    normalizedEstimatedMinutes,
    orderStatusFields,
    publicOrderStatusFields,
  } = buildOrderTransitionPersistenceFields({
    action,
    now,
    actorUserId,
    reason: transition.reason,
    estimatedMinutes,
  })

  const [updatedOrder] = await dbSession
    .update(ordersTable)
    .set({ status: transition.toStatus, ...orderStatusFields })
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.storeId, storeId)))
    .returning()

  const [publicSubmission] = await dbSession
    .update(publicOrderSubmissionsTable)
    .set({ status: transition.toStatus, ...publicOrderStatusFields })
    .where(
      and(
        eq(publicOrderSubmissionsTable.orderId, orderId),
        eq(publicOrderSubmissionsTable.storeId, storeId)
      )
    )
    .returning({ id: publicOrderSubmissionsTable.id })

  if (publicSubmission) {
    await dbSession.insert(publicOrderEventsTable).values({
      publicOrderId: publicSubmission.id,
      storeId,
      eventType: 'public_order_status_changed',
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      actorType: 'store',
      actorUserId,
      requestId,
      payload: {
        ...(transition.reason ? { reason: transition.reason } : {}),
        ...(normalizedEstimatedMinutes
          ? { estimatedMinutes: normalizedEstimatedMinutes }
          : {}),
      },
    })
  }

  await createOrderAuditEventOnDb({
    dbSession,
    event: {
      orderId,
      storeId,
      eventType: 'status_changed',
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      actorType: 'store',
      actorUserId,
      origin: 'MANUAL',
      reason: transition.reason,
      requestId,
      metadata: {
        salesChannel: order.salesChannel,
        displayId: order.displayId,
      },
    },
  })

  await enqueueOrderStatusWhatsappNotificationOnDb({
    order: updatedOrder,
    fromStatus: transition.fromStatus,
    toStatus: transition.toStatus,
    reason: transition.reason,
    dbSession,
  })

  if (transition.toStatus === 'COMPLETED') {
    await enqueueOrderBenefitWhatsappNotificationsOnDb({
      order: updatedOrder,
      dbSession,
    })
  }

  return updatedOrder
}

export const addOrderAuditNoteOnDb = async ({
  orderId,
  storeId,
  reason,
  actorUserId,
  requestId,
  dbSession,
}: {
  orderId: number
  storeId: number
  reason: string
  actorUserId: string
  requestId: string
  dbSession: DbSession
}) => {
  const [order] = await dbSession
    .select({
      salesChannel: ordersTable.salesChannel,
      displayId: ordersTable.displayId,
    })
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.storeId, storeId)))
    .limit(1)
    .for('update')
  if (!order) throw new Error('Pedido nao encontrado.')

  return createOrderAuditEventOnDb({
    dbSession,
    event: {
      orderId,
      storeId,
      eventType: 'note_added',
      actorType: 'store',
      actorUserId,
      origin: 'MANUAL',
      reason: requireAuditReason(reason),
      requestId,
      metadata: {
        salesChannel: order.salesChannel,
        displayId: order.displayId,
      },
    },
  })
}

export const createOrderItemOnDb = async ({
  newOrderItem,
  dbSession,
}: {
  newOrderItem: InsertOrderItem
  dbSession: DbSession
}) => {
  const [createdOrderItem] = await dbSession
    .insert(orderItemsTable)
    .values({ ...newOrderItem, orderId: newOrderItem.orderId })
    .returning()

  return createdOrderItem
}

export const createOrderPaymentOnDb = async ({
  newOrderPayment,
  dbSession,
}: {
  newOrderPayment: InsertOrderPayment
  dbSession: DbSession
}) => {
  const [createdOrderPayment] = await dbSession
    .insert(orderPaymentsTable)
    .values({ ...newOrderPayment, orderId: newOrderPayment.orderId })
    .returning()

  return createdOrderPayment
}

export const updateOrderItemInventoryOnDb = async ({
  itemId,
  storeId,
  quantity,
  dbSession,
}: {
  itemId: number
  storeId: number
  quantity: number
  dbSession: DbSession
}) => {
  const updatedItems = await dbSession
    .update(itemsTable)
    .set({ inventory: decrementColumnValue(itemsTable.inventory, quantity) })
    .where(
      and(
        eq(itemsTable.id, itemId),
        eq(itemsTable.storeId, storeId),
        or(isNull(itemsTable.inventory), gte(itemsTable.inventory, quantity))
      )
    )
    .returning({ id: itemsTable.id })

  return updatedItems.length > 0
}

export const createOrderItemOptionsOnDb = async ({
  options,
  dbSession,
}: {
  options: InsertOrderItemOption[]
  dbSession: DbSession
}) => {
  if (options.length === 0) return []

  return await dbSession
    .insert(orderItemOptionsTable)
    .values(options)
    .returning()
}

export type OrderItemQuantity = {
  itemId: number
  quantity: number
}

/**
 * Checks stock availability for a list of items.
 * Returns an array of out-of-stock items with their details.
 * An item is considered out of stock if:
 * - It has a non-null inventory value
 * - The inventory is less than the requested quantity
 * Items with null inventory are considered "infinite stock" (not tracked).
 */
export const checkStockAvailability = async ({
  storeId,
  items,
  dbSession,
}: {
  storeId: number
  items: OrderItemQuantity[]
  dbSession: DbSession
}): Promise<OutOfStockItem[]> => {
  if (items.length === 0) return []

  // Get unique item IDs
  const itemIds = [...new Set(items.map(item => item.itemId))]

  // Fetch items from database
  const dbItems = await dbSession
    .select({
      id: itemsTable.id,
      name: itemsTable.name,
      inventory: itemsTable.inventory,
    })
    .from(itemsTable)
    .where(
      and(eq(itemsTable.storeId, storeId), inArray(itemsTable.id, itemIds))
    )

  // Create a map for quick lookups
  const itemMap = new Map<
    number,
    Pick<SelectItem, 'id' | 'name' | 'inventory'>
  >(dbItems.map(item => [item.id, item]))

  // Aggregate requested quantities by item ID
  const requestedQuantities = new Map<number, number>()
  for (const item of items) {
    const current = requestedQuantities.get(item.itemId) ?? 0
    requestedQuantities.set(item.itemId, current + item.quantity)
  }

  // Check each item for stock availability
  const outOfStockItems: OutOfStockItem[] = []
  for (const [itemId, requestedQty] of requestedQuantities) {
    const dbItem = itemMap.get(itemId)

    if (!dbItem) {
      outOfStockItems.push({
        itemId,
        name: 'Item indisponivel',
        requestedQty,
        availableQty: 0,
      })
      continue
    }

    // If inventory is null, item has infinite stock (not tracked)
    if (dbItem.inventory === null) continue

    // Check if requested quantity exceeds available
    if (requestedQty > dbItem.inventory) {
      outOfStockItems.push({
        itemId: dbItem.id,
        name: dbItem.name,
        requestedQty,
        availableQty: dbItem.inventory,
      })
    }
  }

  return outOfStockItems
}
