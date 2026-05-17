'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'
import { ordersTable } from '@/services/db/schema/orders'
import { coalesce, jsonAgg } from '@/services/db/utils'
import { and, count, eq, gte, lte, ne, sql, sum } from 'drizzle-orm'

export const getRevenueSummary = async (
  storeId: number,
  startDate?: string,
  endDate?: string
): Promise<any> => {
  await validateUserPermissionsForStore(storeId, 'admin')

  const orderCreatedAtWithTimezone = sql<Date>`date(timezone('America/Sao_Paulo', ${ordersTable.createdAt}))`
  const dailyBreakdownsTempTable = db.$with('dailyBreakdownsTempTable').as(
    db
      .select({
        date: orderCreatedAtWithTimezone.as('date'),
        dailyOrders: count(ordersTable.id).as('dailyOrders'),
        dailyRevenue: coalesce(
          sum(ordersTable.totalPrice),
          sql<string>`0.0000`
        ).as('dailyRevenue'),
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.storeId, storeId),
          ne(ordersTable.status, 'CANCELLED'),
          startDate
            ? gte(orderCreatedAtWithTimezone, sql`date(${startDate})`)
            : undefined,
          endDate
            ? lte(orderCreatedAtWithTimezone, sql`date(${endDate})`)
            : undefined
        )
      )
      .groupBy(orderCreatedAtWithTimezone)
      .orderBy(orderCreatedAtWithTimezone)
  )

  const [revenueSummary] = await db
    .with(dailyBreakdownsTempTable)
    .select({
      totalOrders: sum(dailyBreakdownsTempTable.dailyOrders).as('totalOrders'),
      totalRevenue: sum(dailyBreakdownsTempTable.dailyRevenue).as(
        'totalRevenue'
      ),
      averageOrderValue:
        sql<number>`sum(${dailyBreakdownsTempTable.dailyRevenue}) / sum(${dailyBreakdownsTempTable.dailyOrders})`.as(
          'averageOrderValue'
        ),
      dailyBreakdowns: jsonAgg(dailyBreakdownsTempTable),
    })
    .from(dailyBreakdownsTempTable)

  return revenueSummary
}
