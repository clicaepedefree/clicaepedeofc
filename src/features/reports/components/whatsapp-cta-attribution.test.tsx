import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  WhatsappCtaAttribution,
  type WhatsappCtaMetrics,
} from './whatsapp-cta-attribution'

const metrics: WhatsappCtaMetrics = {
  accesses: 42,
  carts: 13,
  ordersCreated: 8,
  ordersCompleted: 5,
  ordersCancelled: 2,
  completedRevenue: '1234.5000',
  otherIntegrationOrders: 7,
  attributedOrdersWithoutAccess: 3,
  retentionDays: 30,
}
const render = (value?: WhatsappCtaMetrics | null) =>
  renderToStaticMarkup(
    createElement(WhatsappCtaAttribution, { metrics: value })
  )

describe('WhatsApp attribution SSR', () => {
  test('renders accessible, unframed counts, revenue and separate exceptions', () => {
    const html = render(metrics)
    for (const text of [
      'Origem WhatsApp',
      'Acessos consentidos nos ultimos 30 dias. Nao representam pessoas unicas.',
      'Pedidos criados no periodo selecionado.',
      'Acessos medidos',
      'Carrinhos iniciados',
      'Pedidos gerados',
      'Pedidos concluidos',
      'Pedidos cancelados',
      'Receita concluida',
      'Pedidos de outras integracoes',
      'Pedidos atribuidos sem acesso medido',
      'R$1.234,50',
      'aria-labelledby=',
      'aria-describedby=',
    ])
      expect(html.includes(text)).toBe(true)
    expect((html.match(/<dl /g) ?? []).length).toBe(2)
    expect((html.match(/<dt /g) ?? []).length).toBe(8)
    expect(html.includes('%')).toBe(false)
    expect(html.includes('data-slot="card"')).toBe(false)
  })

  test('real zeros stay visible, including when there are no completed sales', () => {
    const html = render({
      ...metrics,
      accesses: 0,
      carts: 0,
      ordersCreated: 0,
      ordersCompleted: 0,
      ordersCancelled: 0,
      completedRevenue: '0.0000',
      otherIntegrationOrders: 0,
      attributedOrdersWithoutAccess: 0,
    })
    expect((html.match(/>0<\/dd>/g) ?? []).length).toBe(7)
    expect(html.includes('R$0,00')).toBe(true)
    expect(html.includes('Indisponivel')).toBe(false)
  })

  test('missing payload and malformed fields never become false zeros', () => {
    for (const value of [undefined, null]) {
      const html = render(value)
      expect(html.includes('Dados de origem WhatsApp indisponiveis.')).toBe(
        true
      )
      expect(html.includes('<dd')).toBe(false)
    }
    for (const completedRevenue of ['', 'invalid', 'Infinity']) {
      const html = render({
        ...metrics,
        accesses: null,
        carts: -1,
        ordersCreated: NaN,
        ordersCompleted: undefined,
        completedRevenue,
      } as unknown as WhatsappCtaMetrics)
      expect((html.match(/>Indisponivel<\/dd>/g) ?? []).length).toBe(5)
      expect(html.includes('R$0,00')).toBe(false)
    }
  })
})

const { mock } = require('bun:test') as {
  mock: { module(name: string, factory: () => unknown): void }
}
let reportState = {
  revenueSummary: { totalOrders: 0, whatsappCtaMetrics: metrics } as
    | {
        totalOrders: number
        whatsappCtaMetrics?: WhatsappCtaMetrics | null
      }
    | undefined,
  isLoading: false,
  isEnabled: true,
  period: { isRangeValid: true },
}
mock.module('@/features/reports/hooks/use-revenue-report', () => ({
  useRevenueSummary: () => reportState,
}))
mock.module('@/features/admin/components/admin-page-info', () => ({
  AdminPageInfo: () => null,
}))
mock.module('@/features/reports/components/report-period-filter', () => ({
  ReportPeriodFilter: () => null,
}))
mock.module('@/features/reports/components/revenue-multiline-chart', () => ({
  RevenueMultilineChart: () => null,
}))
mock.module('@/features/reports/components/sales-channel-breakdown', () => ({
  SalesChannelBreakdown: () => null,
}))
mock.module('@/features/reports/components/store-adoption-metrics', () => ({
  StoreAdoptionMetrics: () => null,
}))
mock.module('@/features/reports/components/top-selling-products', () => ({
  TopSellingProducts: () => null,
}))
const { default: ReportsPage } = await import('@/app/(admin)/reports/page')
const renderPage = () => renderToStaticMarkup(createElement(ReportsPage))

describe('reports attribution integration SSR without API or database', () => {
  test('shows attribution with no sales and respects existing period/loading gates', () => {
    expect(renderPage().includes('Origem WhatsApp')).toBe(true)
    expect(renderPage().includes('Loja não possui vendas')).toBe(true)
    for (const gate of ['loading', 'disabled', 'invalid']) {
      reportState = {
        ...reportState,
        isLoading: gate === 'loading',
        isEnabled: gate !== 'disabled',
        period: { isRangeValid: gate !== 'invalid' },
      }
      expect(renderPage().includes('Origem WhatsApp')).toBe(false)
    }
  })

  test('failed or absent report payload shows unavailable rather than zero metrics', () => {
    for (const revenueSummary of [
      undefined,
      { totalOrders: 0 },
      { totalOrders: 0, whatsappCtaMetrics: null },
    ]) {
      reportState = {
        revenueSummary,
        isLoading: false,
        isEnabled: true,
        period: { isRangeValid: true },
      }
      const html = renderPage()
      expect(html.includes('Dados de origem WhatsApp indisponiveis.')).toBe(
        true
      )
      expect(html.includes('<dd')).toBe(false)
    }
  })
})
