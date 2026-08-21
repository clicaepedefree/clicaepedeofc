import { describe, expect, test } from 'bun:test'

import {
  buildTopSellingProducts,
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

  test('ranks the five best selling products with deterministic ties', () => {
    const ranking = buildTopSellingProducts([
      {
        itemId: 10,
        itemName: 'Produto removido do cardapio',
        quantity: '4.0000',
        revenue: '80.0000',
        salesChannel: 'DIGITAL_MENU',
        orderType: 'DELIVERY',
        origin: 'cardapio-digital',
      },
      {
        itemId: 11,
        itemName: 'Batata',
        quantity: '4.0000',
        revenue: '90.0000',
        salesChannel: 'POS',
        orderType: 'TAKEOUT',
        origin: 'POS',
      },
      {
        itemId: 12,
        itemName: 'Acai',
        quantity: '2.0000',
        revenue: '50.0000',
        salesChannel: 'POS',
        orderType: 'INDOOR',
        origin: 'MANUAL',
      },
      {
        itemId: 13,
        itemName: 'Cafe',
        quantity: '2.0000',
        revenue: '50.0000',
        salesChannel: 'DIGITAL_MENU',
        orderType: 'TAKEOUT',
        origin: 'cardapio-digital',
      },
      {
        itemId: 14,
        itemName: 'Docinho',
        quantity: '1.0000',
        revenue: '20.0000',
        salesChannel: 'POS',
        orderType: 'DELIVERY',
        origin: 'IFOOD',
      },
      {
        itemId: 15,
        itemName: 'Empada',
        quantity: '1.0000',
        revenue: '10.0000',
        salesChannel: 'POS',
        orderType: 'TAKEOUT',
        origin: 'POS',
      },
    ])

    expect(ranking.map(product => product.itemName)).toEqual([
      'Batata',
      'Produto removido do cardapio',
      'Acai',
      'Cafe',
      'Docinho',
    ])
    expect(ranking[1]?.itemId).toBe(10)
    expect(ranking[1]?.quantity).toBe('4.0000')
    expect(ranking[1]?.revenue).toBe('80.0000')
    expect(ranking[1]?.predominantChannel).toBe('own_delivery')
    expect(ranking).toHaveLength(5)
  })

  test('chooses the predominant product channel by quantity and then revenue', () => {
    const [product] = buildTopSellingProducts([
      {
        itemId: 20,
        itemName: 'Combo da casa',
        quantity: '2.0000',
        revenue: '100.0000',
        salesChannel: 'DIGITAL_MENU',
        orderType: 'DELIVERY',
        origin: 'cardapio-digital',
      },
      {
        itemId: 20,
        itemName: 'Combo da casa',
        quantity: '3.0000',
        revenue: '90.0000',
        salesChannel: 'POS',
        orderType: 'TAKEOUT',
        origin: 'POS',
      },
      {
        itemId: 20,
        itemName: 'Combo da casa',
        quantity: '3.0000',
        revenue: '120.0000',
        salesChannel: 'POS',
        orderType: 'INDOOR',
        origin: 'MANUAL',
      },
    ])

    expect(product.quantity).toBe('8.0000')
    expect(product.revenue).toBe('310.0000')
    expect(product.predominantChannel).toBe('tables')
  })
})
