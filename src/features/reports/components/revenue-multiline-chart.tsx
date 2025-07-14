'use client'

import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from 'recharts'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/card'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/shared/chart'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { formatDate } from '@/shared/formatters/date'
import { useMemo, useState } from 'react'

export const description = 'A multiple line chart'

const chartConfig = {
  dailyOrders: {
    label: 'Pedidos',
    color: 'var(--chart-1)',
  },
  dailyRevenue: {
    label: 'Receita',
    color: 'var(--chart-2)',
  },
  dailyAverageOrderValue: {
    label: 'Ticket médio',
    color: 'var(--chart-3)',
  },
} as const satisfies ChartConfig

type ChartDatum = {
  date: Date
  dailyOrders: number
  dailyRevenue: string
}

type RevenueMultilineChartProps = {
  chartData: ChartDatum[]
  dates: {
    startDate: string
    endDate: string
  }
}

type ChartKey = keyof typeof chartConfig

const chartKeys = Object.keys(chartConfig) as ChartKey[]

export function RevenueMultilineChart({
  chartData,
  dates,
}: RevenueMultilineChartProps) {
  const [activeCharts, setActiveCharts] = useState<ChartKey[]>(['dailyRevenue'])

  const toggleChartVisibility = (chartKey: ChartKey) => {
    setActiveCharts(prev => {
      if (prev.includes(chartKey)) {
        return prev.filter(key => key !== chartKey)
      } else {
        return [...prev, chartKey]
      }
    })
  }

  const chartDataParsed = useMemo(() => {
    return chartData.map(item => ({
      ...item,
      date: formatDate(item.date, 'DD MMM'),
      dailyAverageOrderValue: Number(item.dailyRevenue) / item.dailyOrders,
    }))
  }, [chartData])

  return (
    <Card className="pt-0">
      <CardHeader className="flex flex-col items-stretch border-b !px-0 !py-2 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 sm:pb-0">
          <CardTitle>Receita da loja</CardTitle>
          <CardDescription>Total de vendas</CardDescription>
        </div>
        <div className="flex">
          <div className="data-[active=true]:bg-muted/50 relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l sm:border-t-0 sm:border-l sm:px-8 sm:py-6">
            <span className="text-muted-foreground text-xs">De</span>
            <span className="text-lg leading-none font-semibold sm:text-xl text-nowrap">
              {formatDate(dates.startDate, 'DD MMMM YYYY')}
            </span>
          </div>
          <div className="data-[active=true]:bg-muted/50 relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l sm:border-t-0 sm:border-l sm:px-8 sm:py-6">
            <span className="text-muted-foreground text-xs">Até</span>
            <span className="text-lg leading-none font-semibold sm:text-xl text-nowrap">
              {formatDate(dates.endDate, 'DD MMMM YYYY')}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-80 w-full">
          <LineChart
            accessibilityLayer
            data={chartDataParsed}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              yAxisId="dailyRevenueYAxis"
              dataKey="dailyRevenue"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={value =>
                formatValueToCurrency({
                  value,
                  includeCurrencySymbol: true,
                })
              }
              hide={!activeCharts.includes('dailyRevenue')}
              orientation="left"
            />
            <YAxis
              yAxisId="dailyOrdersYAxis"
              dataKey="dailyOrders"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={value => `${value}`}
              hide={!activeCharts.includes('dailyOrders')}
              orientation={activeCharts.length > 1 ? 'right' : 'left'}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  valueFormatter={(value, _, item) => {
                    if (item?.dataKey === 'dailyOrders') {
                      return value
                    }

                    return formatValueToCurrency({
                      value: value.toString(),
                      includeCurrencySymbol: true,
                    })
                  }}
                />
              }
            />
            <Legend
              onClick={e =>
                e.dataKey && toggleChartVisibility(e.dataKey as ChartKey)
              }
            />
            {chartKeys.map(key => (
              <Line
                key={key}
                dataKey={key}
                name={chartConfig[key].label}
                type="monotone"
                stroke={chartConfig[key].color}
                strokeWidth={2}
                dot={false}
                yAxisId={
                  key === 'dailyOrders'
                    ? 'dailyOrdersYAxis'
                    : 'dailyRevenueYAxis'
                }
                hide={!activeCharts.includes(key)}
                animationDuration={800}
              />
            ))}
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
