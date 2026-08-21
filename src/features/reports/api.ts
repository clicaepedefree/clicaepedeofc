'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'
import { ordersTable } from '@/services/db/schema/orders'
import { coalesce, jsonAgg } from '@/services/db/utils'
import { and, count, eq, gte, lte, sql, sum } from 'drizzle-orm'
import { buildOperationalSalesMetricsSummary } from './sales-channel-metrics'

export const getRevenueSummary = async (
  storeId: number,
  startDate?: string,
  endDate?: string
): Promise<any> => {
  await validateUserPermissionsForStore(storeId, 'admin')

  const orderCreatedAtWithTimezone = sql<Date>`date(timezone('America/Sao_Paulo', ${ordersTable.createdAt}))`
  const eligibleOrderFilters = and(
    eq(ordersTable.storeId, storeId),
    eq(ordersTable.status, 'COMPLETED'),
    startDate
      ? gte(orderCreatedAtWithTimezone, sql`date(${startDate})`)
      : undefined,
    endDate ? lte(orderCreatedAtWithTimezone, sql`date(${endDate})`) : undefined
  )
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
      .where(eligibleOrderFilters)
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

  const channelRows = await db
    .select({
      orders: count(ordersTable.id).as('orders'),
      revenue: coalesce(sum(ordersTable.totalPrice), sql<string>`0.0000`).as(
        'revenue'
      ),
      salesChannel: ordersTable.salesChannel,
      orderType: ordersTable.type,
      origin: ordersTable.origin,
    })
    .from(ordersTable)
    .where(eligibleOrderFilters)
    .groupBy(ordersTable.salesChannel, ordersTable.type, ordersTable.origin)

  const operationalSummary = buildOperationalSalesMetricsSummary(channelRows)

  return {
    ...revenueSummary,
    totalOrders: operationalSummary.totalOrders,
    totalRevenue: operationalSummary.totalRevenue,
    averageOrderValue: operationalSummary.averageOrderValue,
    dailyBreakdowns: revenueSummary?.dailyBreakdowns ?? [],
    channelBreakdowns: operationalSummary.channelBreakdowns,
    classificationNote: operationalSummary.classificationNote,
    revenueTreatmentNote: operationalSummary.revenueTreatmentNote,
  }
}
