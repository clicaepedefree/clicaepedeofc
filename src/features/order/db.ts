'use server'

import { InsertOrderItem, orderItemsTable } from '@/services/db/schema/order-items'
import { InsertOrder, ordersTable } from '@/services/db/schema/orders'
import { DbSession } from '@/services/db/types'
import { and, count, eq, sql } from 'drizzle-orm'

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

export const createOrderOnDb = async ({ newOrder, dbSession }: { newOrder: InsertOrder; dbSession: DbSession }) => {
  const [createdOrder] = await dbSession.insert(ordersTable).values(newOrder).returning()

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
