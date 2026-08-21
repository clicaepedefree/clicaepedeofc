import { describe, expect, test } from 'bun:test'

import {
  buildOperationalSalesMetricsSummary,
  classifyOperationalSalesChannel,
  isOperationalRevenueStatus,
} from './sales-channel-metrics'

describe('operational sales channel metrics', () => {
  test('classifies current and future order sources into documented channels', () => {
    expect(
      classifyOperationalSalesChannel({
        salesChannel: 'DIGITAL_MENU',
        orderType: 'DELIVERY',
        origin: 'cardapio-digital',
      })
    ).toBe('own_delivery')
    expect(
      classifyOperationalSalesChannel({
        salesChannel: 'DIGITAL_MENU',
        orderType: 'TAKEOUT',
        origin: 'cardapio-digital',
      })
    ).toBe('own_delivery')
    expect(
      classifyOperationalSalesChannel({
        salesChannel: 'POS',
        orderType: 'TAKEOUT',
        origin: 'POS',
      })
    ).toBe('pos_counter')
    expect(
      classifyOperationalSalesChannel({
        salesChannel: 'POS',
        orderType: 'INDOOR',
        origin: 'MANUAL',
      })
    ).toBe('tables')
    expect(
      classifyOperationalSalesChannel({
        salesChannel: 'POS',
        orderType: 'DELIVERY',
        origin: 'IFOOD',
      })
    ).toBe('integrations')
  })

  test('keeps revenue eligibility limited to completed orders', () => {
    expect(isOperationalRevenueStatus('COMPLETED')).toBe(true)
    expect(isOperationalRevenueStatus('CANCELLED')).toBe(false)
    expect(isOperationalRevenueStatus('REJECTED')).toBe(false)
    expect(isOperationalRevenueStatus('IN_PREPARATION')).toBe(false)
  })

  test('builds totals from channel buckets without duplicating integrated sales', () => {
    const summary = buildOperationalSalesMetricsSummary([
      {
        salesChannel: 'DIGITAL_MENU',
        orderType: 'DELIVERY',
        origin: 'cardapio-digital',
        orders: 2,
        revenue: '80.0000',
      },
      {
        salesChannel: 'POS',
        orderType: 'TAKEOUT',
        origin: 'POS',
        orders: 1,
        revenue: '20.0000',
      },
      {
        salesChannel: 'POS',
        orderType: 'INDOOR',
        origin: 'MANUAL',
        orders: 3,
        revenue: '150.0000',
      },
      {
        salesChannel: 'POS',
        orderType: 'DELIVERY',
        origin: 'IFOOD',
        orders: 1,
        revenue: '50.0000',
      },
    ])

    expect(summary.totalOrders).toBe(7)
    expect(summary.totalRevenue).toBe('300.0000')
    expect(summary.averageOrderValue).toBe('42.8571')
    expect(summary.channelBreakdowns.map(channel => channel.orders)).toEqual([
      2, 1, 3, 1,
    ])
    expect(
      summary.channelBreakdowns.reduce(
        (sum, channel) => sum + Number(channel.revenue),
        0
      )
    ).toBe(300)
  })
})
