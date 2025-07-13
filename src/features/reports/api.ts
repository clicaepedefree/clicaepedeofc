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

  // Get data using a single query approach
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
    // When date range is provided, get daily breakdown and calculate totals from it
    const dailyData = await db
      .select({
        date: sql`date(timezone('America/Sao_Paulo', ${ordersTable.createdAt}))`.as(
          'date'
        ),
        totalOrders: count(ordersTable.id),
        totalRevenue: sum(ordersTable.totalPrice),
      })
      .from(ordersTable)
      .where(and(...baseConditions))
      .groupBy(
        sql`date(timezone('America/Sao_Paulo', ${ordersTable.createdAt}))`
      )
      .orderBy(
        sql`date(timezone('America/Sao_Paulo', ${ordersTable.createdAt}))`
      )

    // Process daily data and calculate overall totals
    dailyBreakdown = dailyData.map(day => {
      const dayTotalOrders = day.totalOrders || 0
      const dayTotalRevenue = Number(day.totalRevenue) || 0
      const dayAverageOrderValue =
        dayTotalOrders > 0 ? dayTotalRevenue / dayTotalOrders : 0

      // Accumulate totals
      totalOrders += dayTotalOrders
      totalRevenue += dayTotalRevenue

      return {
        date: day.date as string,
        totalOrders: dayTotalOrders,
        totalRevenue: dayTotalRevenue,
        averageOrderValue: Number(dayAverageOrderValue.toFixed(2)),
      }
    })

    // Calculate overall average
    averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
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
