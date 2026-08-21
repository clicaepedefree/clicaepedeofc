'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'
import { categoriesTable } from '@/services/db/schema/categories'
import { itemOfferingsTable } from '@/services/db/schema/item-offerings'
import { itemsTable } from '@/services/db/schema/items'
import { orderItemOptionsTable } from '@/services/db/schema/order-item-options'
import { orderItemsTable } from '@/services/db/schema/order-items'
import { ordersTable } from '@/services/db/schema/orders'
import { userStorePermissionsTable } from '@/services/db/schema/user-store-permissions'
import { usersTable } from '@/services/db/schema/users'
import { coalesce, jsonAgg } from '@/services/db/utils'
import { and, count, desc, eq, gte, isNull, lt, sql, sum } from 'drizzle-orm'
import {
  ensureValidReportRange,
  isSupportedReportTimeZone,
  maxAllTimeDailyBreakdownDays,
  reportTimeZone,
  type ReportPeriodPreset,
} from './form-validation/report-period'
import {
  buildOperationalSalesMetricsSummary,
  buildStoreAdoptionMetrics,
  buildTopSellingProducts,
} from './sales-channel-metrics'

type GetRevenueSummaryOptions = {
  startDate?: string
  endDate?: string
  periodPreset?: ReportPeriodPreset
}

export const getRevenueSummary = async (
  storeId: number,
  options: GetRevenueSummaryOptions = {}
): Promise<any> => {
  const { store } = await validateUserPermissionsForStore(storeId, 'reports.view')
  const { startDate, endDate, periodPreset } = options
  const timeZone = isSupportedReportTimeZone(store.timezone)
    ? store.timezone
    : reportTimeZone
  const isAllTime = periodPreset === 'ALL_TIME' && !startDate && !endDate

  ensureValidReportRange(startDate, endDate)

  const periodStartSql = startDate
    ? sql`${startDate}::date::timestamp at time zone ${timeZone}`
    : undefined
  const periodEndSql = endDate
    ? sql`(${endDate}::date + interval '1 day')::timestamp at time zone ${timeZone}`
    : undefined

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
  const optionRevenueByOrderItem = db
    .select({
      orderItemId: orderItemOptionsTable.orderItemId,
      revenue:
        sql<string>`coalesce(sum(${orderItemOptionsTable.quantity} * ${orderItemOptionsTable.price}), 0)::text`.as(
          'revenue'
        ),
    })
    .from(orderItemOptionsTable)
    .groupBy(orderItemOptionsTable.orderItemId)
    .as('optionRevenueByOrderItem')

  const productRows = await db
    .select({
      itemId: orderItemsTable.itemId,
      itemName: orderItemsTable.itemName,
      quantity: coalesce(sum(orderItemsTable.quantity), sql<string>`0.0000`).as(
        'quantity'
      ),
      revenue:
        sql<string>`coalesce(sum(${orderItemsTable.quantity} * (${orderItemsTable.price} + coalesce(${optionRevenueByOrderItem.revenue}::numeric, 0))), 0)::text`.as(
          'revenue'
        ),
      salesChannel: ordersTable.salesChannel,
      orderType: ordersTable.type,
      origin: ordersTable.origin,
    })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .leftJoin(
      optionRevenueByOrderItem,
      eq(optionRevenueByOrderItem.orderItemId, orderItemsTable.id)
    )
    .where(eligibleOrderFilters)
    .groupBy(
      orderItemsTable.itemId,
      orderItemsTable.itemName,
      ordersTable.salesChannel,
      ordersTable.type,
      ordersTable.origin
    )

  const topSellingProducts = buildTopSellingProducts(productRows)
  const [productCounts] = await db
    .select({
      registeredProducts: sql<number>`count(distinct ${itemsTable.id})`.as(
        'registeredProducts'
      ),
      activeProducts: sql<number>`count(distinct ${itemsTable.id}) filter (
          where ${itemOfferingsTable.isAvailable} = true
            and ${categoriesTable.isAvailable} = true
            and (${itemsTable.inventory} is null or ${itemsTable.inventory} > 0)
        )`.as('activeProducts'),
    })
    .from(itemsTable)
    .leftJoin(itemOfferingsTable, eq(itemOfferingsTable.itemId, itemsTable.id))
    .leftJoin(
      categoriesTable,
      and(
        eq(categoriesTable.id, itemOfferingsTable.categoryId),
        eq(categoriesTable.storeId, storeId)
      )
    )
    .where(eq(itemsTable.storeId, storeId))

  const customerKey = sql<string | null>`coalesce(
    nullif(regexp_replace(coalesce(${ordersTable.customerPhone}, ''), '\\D', '', 'g'), ''),
    nullif(regexp_replace(coalesce(${ordersTable.customerDocument}, ''), '\\D', '', 'g'), '')
  )`
  const firstOrderByCustomer = db.$with('firstOrderByCustomer').as(
    db
      .select({
        customerKey: customerKey.as('customerKey'),
        firstOrderAt:
          sql<Date>`min(coalesce(${ordersTable.completedAt}, ${ordersTable.createdAt}))`.as(
            'firstOrderAt'
          ),
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.storeId, storeId),
          eq(ordersTable.status, 'COMPLETED'),
          sql`${customerKey} is not null`
        )
      )
      .groupBy(customerKey)
  )
  const [customerCounts] = await db
    .with(firstOrderByCustomer)
    .select({
      totalCustomers: count(firstOrderByCustomer.customerKey).as(
        'totalCustomers'
      ),
      newCustomersInPeriod: sql<number>`count(*) filter (
          where ${periodStartSql ? sql`${firstOrderByCustomer.firstOrderAt} >= ${periodStartSql}` : sql`true`}
            and ${periodEndSql ? sql`${firstOrderByCustomer.firstOrderAt} < ${periodEndSql}` : sql`true`}
        )`.as('newCustomersInPeriod'),
    })
    .from(firstOrderByCustomer)

  const [lastSaleRow] = await db
    .select({
      lastSaleAt:
        sql<Date>`coalesce(${ordersTable.completedAt}, ${ordersTable.createdAt})`.as(
          'lastSaleAt'
        ),
    })
    .from(ordersTable)
    .where(
      and(eq(ordersTable.storeId, storeId), eq(ordersTable.status, 'COMPLETED'))
    )
    .orderBy(
      desc(sql`coalesce(${ordersTable.completedAt}, ${ordersTable.createdAt})`)
    )
    .limit(1)

  const [lastAccessRow] = await db
    .select({ lastAccessAt: usersTable.lastLoginAt })
    .from(userStorePermissionsTable)
    .innerJoin(usersTable, eq(usersTable.id, userStorePermissionsTable.userId))
    .where(
      and(
        eq(userStorePermissionsTable.storeId, storeId),
        eq(userStorePermissionsTable.role, 'owner'),
        isNull(userStorePermissionsTable.revokedAt),
        eq(usersTable.status, 'active'),
        sql`${usersTable.lastLoginAt} is not null`
      )
    )
    .orderBy(desc(usersTable.lastLoginAt))
    .limit(1)

  const adoptionMetrics = buildStoreAdoptionMetrics({
    registeredProducts: productCounts?.registeredProducts ?? 0,
    activeProducts: productCounts?.activeProducts ?? 0,
    totalCustomers: customerCounts?.totalCustomers ?? 0,
    newCustomersInPeriod: customerCounts?.newCustomersInPeriod ?? 0,
    lastSaleAt: lastSaleRow?.lastSaleAt ?? null,
    lastAccessAt: lastAccessRow?.lastAccessAt ?? null,
  })

  return {
    ...revenueSummary,
    totalOrders: operationalSummary.totalOrders,
    totalRevenue: operationalSummary.totalRevenue,
    averageOrderValue: operationalSummary.averageOrderValue,
    dailyBreakdowns: revenueSummary?.dailyBreakdowns ?? [],
    channelBreakdowns: operationalSummary.channelBreakdowns,
    topSellingProducts,
    adoptionMetrics,
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
