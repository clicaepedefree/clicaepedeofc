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
import { InsertOrder, ordersTable } from '@/services/db/schema/orders'
import { OutOfStockItem } from '@/shared/errors/out-of-stock-error'
import { DbSession } from '@/services/db/types'
import { decrementColumnValue } from '@/services/db/utils/decrement-column-value'
import { and, count, eq, inArray, sql } from 'drizzle-orm'

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
  quantity,
  dbSession,
}: {
  itemId: number
  quantity: number
  dbSession: DbSession
}) => {
  await dbSession
    .update(itemsTable)
    .set({ inventory: decrementColumnValue(itemsTable.inventory, quantity) })
    .where(eq(itemsTable.id, itemId))
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
  items,
  dbSession,
}: {
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
    .where(inArray(itemsTable.id, itemIds))

  // Create a map for quick lookups
  const itemMap = new Map<number, Pick<SelectItem, 'id' | 'name' | 'inventory'>>(
    dbItems.map(item => [item.id, item])
  )

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

    // If item doesn't exist in DB, skip (will be caught elsewhere)
    if (!dbItem) continue

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
