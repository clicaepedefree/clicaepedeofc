export const operationalSalesMetricStatuses = ['COMPLETED'] as const

export const operationalSalesChannelKeys = [
  'own_delivery',
  'pos_counter',
  'tables',
  'integrations',
] as const

export type OperationalSalesChannelKey =
  (typeof operationalSalesChannelKeys)[number]

export type OperationalSalesMetricRow = {
  orders: number | string | null
  revenue: number | string | null
  salesChannel: string
  orderType: string
  origin?: string | null
}

export type OperationalSalesChannelBreakdown = {
  key: OperationalSalesChannelKey
  label: string
  description: string
  orders: number
  revenue: string
  averageOrderValue: string
  treatment: string
}

export type OperationalSalesMetricsSummary = {
  totalOrders: number
  totalRevenue: string
  averageOrderValue: string
  channelBreakdowns: OperationalSalesChannelBreakdown[]
  classificationNote: string
  revenueTreatmentNote: string
}

export type ProductPerformanceRow = {
  itemId: number
  itemName: string
  quantity: number | string | null
  revenue: number | string | null
  salesChannel: string
  orderType: string
  origin?: string | null
}

export type TopSellingProduct = {
  itemId: number
  itemName: string
  quantity: string
  revenue: string
  predominantChannel: OperationalSalesChannelKey
  predominantChannelLabel: string
}

type OperationalSalesChannelInfo = {
  label: string
  description: string
  treatment: string
}

const channelInfo: Record<
  OperationalSalesChannelKey,
  OperationalSalesChannelInfo
> = {
  own_delivery: {
    label: 'Delivery proprio',
    description:
      'Pedidos diretos do cardapio digital para entrega ou retirada.',
    treatment: 'DIGITAL_MENU + DELIVERY/TAKEOUT sem origem externa',
  },
  pos_counter: {
    label: 'PDV / balcao',
    description:
      'Vendas registradas no caixa para retirada ou atendimento rapido.',
    treatment: 'POS + TAKEOUT/DELIVERY sem origem externa',
  },
  tables: {
    label: 'Mesas',
    description: 'Pedidos de consumo local vinculados ao atendimento de salao.',
    treatment: 'type INDOOR',
  },
  integrations: {
    label: 'Integracoes',
    description:
      'Pedidos recebidos por origem externa, como marketplace ou canal conectado.',
    treatment: 'origin externa ou canal ainda nao mapeado',
  },
}

const internalOrigins = new Set([
  '',
  'pos',
  'manual',
  'digital_menu',
  'cardapio-digital',
])

export const isOperationalRevenueStatus = (status: string) =>
  operationalSalesMetricStatuses.includes(
    status as (typeof operationalSalesMetricStatuses)[number]
  )

export const classifyOperationalSalesChannel = ({
  salesChannel,
  orderType,
  origin,
}: {
  salesChannel: string
  orderType: string
  origin?: string | null
}): OperationalSalesChannelKey => {
  const normalizedOrigin = origin?.trim().toLowerCase() ?? ''

  if (normalizedOrigin && !internalOrigins.has(normalizedOrigin)) {
    return 'integrations'
  }

  if (orderType === 'INDOOR') return 'tables'

  if (
    salesChannel === 'DIGITAL_MENU' &&
    (orderType === 'DELIVERY' || orderType === 'TAKEOUT')
  ) {
    return 'own_delivery'
  }

  if (salesChannel === 'POS') return 'pos_counter'

  return 'integrations'
}

const toMoneyString = (value: number) => value.toFixed(4)

const parseDatabaseMoney = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

const compareTextDeterministically = (left: string, right: string) =>
  left.localeCompare(right, 'pt-BR', { sensitivity: 'base' })

export const buildOperationalSalesMetricsSummary = (
  rows: OperationalSalesMetricRow[]
): OperationalSalesMetricsSummary => {
  const emptyBreakdowns = operationalSalesChannelKeys.map(key => ({
    key,
    ...channelInfo[key],
    orders: 0,
    revenue: '0.0000',
    averageOrderValue: '0.0000',
  }))

  const breakdownsByKey = new Map(
    emptyBreakdowns.map(breakdown => [breakdown.key, { ...breakdown }])
  )

  for (const row of rows) {
    const key = classifyOperationalSalesChannel({
      salesChannel: row.salesChannel,
      orderType: row.orderType,
      origin: row.origin,
    })
    const current = breakdownsByKey.get(key)
    if (!current) continue

    current.orders += Number(row.orders ?? 0)
    current.revenue = toMoneyString(
      parseDatabaseMoney(current.revenue) + parseDatabaseMoney(row.revenue)
    )
    current.averageOrderValue = current.orders
      ? toMoneyString(parseDatabaseMoney(current.revenue) / current.orders)
      : '0.0000'
  }

  const channelBreakdowns = operationalSalesChannelKeys.map(key => {
    const breakdown = breakdownsByKey.get(key)
    if (!breakdown) throw new Error(`Canal operacional nao mapeado: ${key}`)
    return breakdown
  })

  const totalOrders = channelBreakdowns.reduce(
    (sum, channel) => sum + channel.orders,
    0
  )
  const totalRevenue = channelBreakdowns.reduce(
    (sum, channel) => sum + parseDatabaseMoney(channel.revenue),
    0
  )

  return {
    totalOrders,
    totalRevenue: toMoneyString(totalRevenue),
    averageOrderValue: totalOrders
      ? toMoneyString(totalRevenue / totalOrders)
      : '0.0000',
    channelBreakdowns,
    classificationNote:
      'Total operacional = soma dos canais elegiveis: delivery proprio, PDV/balcao, mesas e integracoes.',
    revenueTreatmentNote:
      'Apenas pedidos COMPLETED entram em vendas, faturamento e ticket medio. Cancelados e rejeitados ficam fora; estornos financeiros futuros precisam de evento operacional proprio para abater automaticamente.',
  }
}

export const buildTopSellingProducts = (
  rows: ProductPerformanceRow[],
  limit = 5
): TopSellingProduct[] => {
  const productsBySnapshot = new Map<
    string,
    {
      itemId: number
      itemName: string
      quantity: number
      revenue: number
      channels: Map<
        OperationalSalesChannelKey,
        { quantity: number; revenue: number }
      >
    }
  >()

  for (const row of rows) {
    const key = `${row.itemId}:${row.itemName}`
    const channel = classifyOperationalSalesChannel({
      salesChannel: row.salesChannel,
      orderType: row.orderType,
      origin: row.origin,
    })
    const current = productsBySnapshot.get(key) ?? {
      itemId: row.itemId,
      itemName: row.itemName,
      quantity: 0,
      revenue: 0,
      channels: new Map<
        OperationalSalesChannelKey,
        { quantity: number; revenue: number }
      >(),
    }

    const quantity = parseDatabaseMoney(row.quantity)
    const revenue = parseDatabaseMoney(row.revenue)
    const channelTotals = current.channels.get(channel) ?? {
      quantity: 0,
      revenue: 0,
    }

    current.quantity += quantity
    current.revenue += revenue
    channelTotals.quantity += quantity
    channelTotals.revenue += revenue
    current.channels.set(channel, channelTotals)
    productsBySnapshot.set(key, current)
  }

  return [...productsBySnapshot.values()]
    .sort((left, right) => {
      const quantityDifference = right.quantity - left.quantity
      if (quantityDifference !== 0) return quantityDifference

      const revenueDifference = right.revenue - left.revenue
      if (revenueDifference !== 0) return revenueDifference

      const nameDifference = compareTextDeterministically(
        left.itemName,
        right.itemName
      )
      if (nameDifference !== 0) return nameDifference

      return left.itemId - right.itemId
    })
    .slice(0, limit)
    .map(product => {
      const [predominantChannel] = [...product.channels.entries()].sort(
        ([leftKey, left], [rightKey, right]) => {
          const quantityDifference = right.quantity - left.quantity
          if (quantityDifference !== 0) return quantityDifference

          const revenueDifference = right.revenue - left.revenue
          if (revenueDifference !== 0) return revenueDifference

          return (
            operationalSalesChannelKeys.indexOf(leftKey) -
            operationalSalesChannelKeys.indexOf(rightKey)
          )
        }
      )[0] ?? ['own_delivery']

      return {
        itemId: product.itemId,
        itemName: product.itemName,
        quantity: toMoneyString(product.quantity),
        revenue: toMoneyString(product.revenue),
        predominantChannel,
        predominantChannelLabel: channelInfo[predominantChannel].label,
      }
    })
}
