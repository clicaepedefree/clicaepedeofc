'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'
import { ordersTable } from '@/services/db/schema/orders'
import { coalesce, jsonAgg } from '@/services/db/utils'
import { and, avg, count, eq, gte, lte, ne, sql, sum } from 'drizzle-orm'

export const getRevenueSummary = async (
  storeId: number,
  startDate?: string,
  endDate?: string
) => {
  await validateUserPermissionsForStore(storeId, 'admin')
  const orderCreatedAtWithTimezone = sql<Date>`date(timezone('America/Sao_Paulo', ${ordersTable.createdAt}))`
  const dailyBreakdownsBaseTable = db.$with('dailyBreakdownsBaseTable').as(
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

  const revenueSummary = await db
    .with(dailyBreakdownsBaseTable)
    .select({
      totalOrders: sum(dailyBreakdownsBaseTable.dailyOrders).as('totalOrders'),
      totalRevenue: sum(dailyBreakdownsBaseTable.dailyRevenue).as(
        'totalRevenue'
      ),
      averageOrderValue: avg(dailyBreakdownsBaseTable.dailyRevenue).as(
        'averageOrderValue'
      ),
      dailyBreakdowns: jsonAgg(dailyBreakdownsBaseTable),
    })
    .from(dailyBreakdownsBaseTable)

  return revenueSummary
}
