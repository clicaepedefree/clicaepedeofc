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
import { LoadingSpinner } from '@/shared/spinner'
import { Body } from '@/shared/typography/body'
import dayjs from 'dayjs'
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
  isLoading?: boolean
}

type ChartKey = keyof typeof chartConfig

const chartKeys = Object.keys(chartConfig) as ChartKey[]

export function RevenueMultilineChart({
  chartData,
  dates,
  isLoading,
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
    const revenueByDate = new Map(
      chartData.map(item => [dayjs(item.date).format('YYYY-MM-DD'), item])
    )

    const totalDaysInPeriod =
      dayjs(dates.endDate).diff(dayjs(dates.startDate), 'day') + 1

    return Array.from({ length: totalDaysInPeriod }, (_, dayIndex) => {
      const currentDay = dayjs(dates.startDate).add(dayIndex, 'day')
      const dailyRevenueData = revenueByDate.get(currentDay.format('YYYY-MM-DD'))

      if (dailyRevenueData) {
        return {
          date: formatDate(dailyRevenueData.date, 'DD MMM'),
          dailyOrders: dailyRevenueData.dailyOrders,
          dailyRevenue: dailyRevenueData.dailyRevenue,
          dailyAverageOrderValue:
            Number(dailyRevenueData.dailyRevenue) / dailyRevenueData.dailyOrders,
        }
      }

      return {
        date: formatDate(currentDay.toDate(), 'DD MMM'),
        dailyOrders: 0,
        dailyRevenue: '0',
        dailyAverageOrderValue: 0,
      }
    })
  }, [chartData, dates.startDate, dates.endDate])

  return (
    <Card className="pt-0">
      <CardHeader className="flex flex-col items-stretch border-b !px-0 !py-2 sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 sm:pb-0">
          <CardTitle>Receita da loja</CardTitle>
          <CardDescription>Dados de vendas por dia</CardDescription>
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
      <CardContent className="relative">
        {!chartData.length && (
          <Body
            variant={100}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full text-center pt-4 pb-10 h-full flex items-center justify-center"
          >
            {isLoading ? (
              <LoadingSpinner />
            ) : (
              'Loja não possui vendas no período'
            )}
          </Body>
        )}
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
              hide={
                !activeCharts.includes('dailyRevenue') &&
                !activeCharts.includes('dailyAverageOrderValue')
              }
              orientation="left"
            />
            <YAxis
              yAxisId="dailyOrdersYAxis"
              dataKey="dailyOrders"
              tickLine={false}
              axisLine={false}
              domain={[0, 'dataMax + 1']}
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
