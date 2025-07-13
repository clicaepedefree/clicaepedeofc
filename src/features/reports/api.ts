'use server'

import { validateUserPermissionsForStore } from '@/features/store/api'
import { db } from '@/services/db'
import { ordersTable } from '@/services/db/schema/orders'
import { and, count, eq, gte, lte, ne, sql, sum } from 'drizzle-orm'

export const getRevenueSummary = async (
  storeId: number,
  startDate?: string,
  endDate?: string
) => {
  await validateUserPermissionsForStore(storeId, 'admin')

  // Build the base where conditions
  const baseConditions = [
    eq(ordersTable.storeId, storeId),
    ne(ordersTable.status, 'CANCELLED'),
  ]

  // Add date filtering if provided
  if (startDate) {
    baseConditions.push(
      gte(
        sql`date(timezone('America/Sao_Paulo', ${ordersTable.createdAt}))`,
        sql`date(${startDate})`
      )
    )
  }

  if (endDate) {
    baseConditions.push(
      lte(
        sql`date(timezone('America/Sao_Paulo', ${ordersTable.createdAt}))`,
        sql`date(${endDate})`
      )
    )
  }

  // Get data using a single SQL query with window functions
  let totalOrders = 0
  let totalRevenue = 0
  let averageOrderValue = 0
  let dailyBreakdown: Array<{
    date: string
    totalOrders: number
    totalRevenue: number
    averageOrderValue: number
  }> = []

  if (startDate && endDate) {
    // Use window functions to get both daily breakdown and overall totals in one query
    const data = await db
      .select({
        date: sql`date(timezone('America/Sao_Paulo', ${ordersTable.createdAt}))`.as(
          'date'
        ),
        dailyOrders: count(ordersTable.id),
        dailyRevenue: sum(ordersTable.totalPrice),
        // Window functions to get overall totals
        totalOrders: sql`sum(count(${ordersTable.id})) over()`.as('total_orders'),
        totalRevenue: sql`sum(sum(${ordersTable.totalPrice})) over()`.as('total_revenue'),
      })
      .from(ordersTable)
      .where(and(...baseConditions))
      .groupBy(
        sql`date(timezone('America/Sao_Paulo', ${ordersTable.createdAt}))`
      )
      .orderBy(
        sql`date(timezone('America/Sao_Paulo', ${ordersTable.createdAt}))`
      )

    // Extract overall totals from first row (same across all rows due to window functions)
    if (data.length > 0) {
      totalOrders = Number(data[0].totalOrders) || 0
      totalRevenue = Number(data[0].totalRevenue) || 0
      averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
    }

    // Process daily breakdown - no calculations needed, just format
    dailyBreakdown = data.map(day => {
      const dayTotalOrders = day.dailyOrders || 0
      const dayTotalRevenue = Number(day.dailyRevenue) || 0
      const dayAverageOrderValue =
        dayTotalOrders > 0 ? dayTotalRevenue / dayTotalOrders : 0

      return {
        date: day.date as string,
        totalOrders: dayTotalOrders,
        totalRevenue: dayTotalRevenue,
        averageOrderValue: Number(dayAverageOrderValue.toFixed(2)),
      }
    })
  } else {
    // When no date range is provided, get overall totals only
    const revenueData = await db
      .select({
        totalOrders: count(ordersTable.id),
        totalRevenue: sum(ordersTable.totalPrice),
      })
      .from(ordersTable)
      .where(and(...baseConditions))

    const result = revenueData[0]
    totalOrders = result.totalOrders || 0
    totalRevenue = Number(result.totalRevenue) || 0
    averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
  }

  return {
    totalOrders,
    totalRevenue,
    averageOrderValue: Number(averageOrderValue.toFixed(2)),
    dailyBreakdown,
  }
}
