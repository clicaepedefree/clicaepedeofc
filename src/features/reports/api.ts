'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'
import { ordersTable } from '@/services/db/schema/orders'
import { coalesce, jsonAgg } from '@/services/db/utils'
import { and, count, eq, gte, lt, sql, sum } from 'drizzle-orm'
import {
  ensureValidReportRange,
  isSupportedReportTimeZone,
  maxAllTimeDailyBreakdownDays,
  reportTimeZone,
  type ReportPeriodPreset,
} from './form-validation/report-period'
import { buildOperationalSalesMetricsSummary } from './sales-channel-metrics'

type GetRevenueSummaryOptions = {
  startDate?: string
  endDate?: string
  periodPreset?: ReportPeriodPreset
}

export const getRevenueSummary = async (
  storeId: number,
  options: GetRevenueSummaryOptions = {}
): Promise<any> => {
  const { store } = await validateUserPermissionsForStore(storeId, 'admin')
  const { startDate, endDate, periodPreset } = options
  const timeZone = isSupportedReportTimeZone(store.timezone)
    ? store.timezone
    : reportTimeZone
  const isAllTime = periodPreset === 'ALL_TIME' && !startDate && !endDate

  ensureValidReportRange(startDate, endDate)

  const orderCreatedAtWithTimezone = sql<Date>`date(timezone(${timeZone}, ${ordersTable.createdAt}))`
  const eligibleOrderFilters = and(
    eq(ordersTable.storeId, storeId),
    eq(ordersTable.status, 'COMPLETED'),
    startDate
      ? gte(
          ordersTable.createdAt,
          sql`${startDate}::date::timestamp at time zone ${timeZone}`
        )
      : undefined,
    endDate
      ? lt(
          ordersTable.createdAt,
          sql`(${endDate}::date + interval '1 day')::timestamp at time zone ${timeZone}`
        )
      : undefined
  )
  const dailyBreakdownFilters = and(
    eligibleOrderFilters,
    isAllTime
      ? gte(
          ordersTable.createdAt,
          sql`now() - make_interval(days => ${maxAllTimeDailyBreakdownDays - 1})`
        )
      : undefined
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
      .where(dailyBreakdownFilters)
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
    periodPreset,
    periodStartDate: startDate,
    periodEndDate: endDate,
    periodTimeZone: timeZone,
    dailyBreakdownLimitDays: isAllTime
      ? maxAllTimeDailyBreakdownDays
      : undefined,
  }
}
