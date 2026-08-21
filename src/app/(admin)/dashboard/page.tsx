'use client'

import { AdminPageInfo } from '@/features/admin/components/admin-page-info'
import { ReportPeriodFilter } from '@/features/reports/components/report-period-filter'
import { RevenueMultilineChart } from '@/features/reports/components/revenue-multiline-chart'
import { SalesChannelBreakdown } from '@/features/reports/components/sales-channel-breakdown'
import type { ReportPeriodSelection } from '@/features/reports/form-validation/report-period'
import { useRevenueSummary } from '@/features/reports/hooks/use-revenue-report'
import { Card, CardDescription, CardHeader, CardTitle } from '@/shared/card'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { useState } from 'react'

export default function Page() {
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriodSelection>({
    preset: 'LAST_7_DAYS',
  })

  const { revenueSummary, isLoading, period } =
    useRevenueSummary(selectedPeriod)

  return (
    <>
      <AdminPageInfo pageInfo={{ title: 'Dashboard' }} />
      <div className="w-full max-w-[inherit] space-y-4 p-4 md:p-6">
        <ReportPeriodFilter
          value={selectedPeriod}
          period={period}
          onChange={setSelectedPeriod}
          disabled={isLoading}
        />
        {!period.isRangeValid && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Ajuste o período para consultar os indicadores.
          </p>
        )}
        <>
          <div className="mb-4 grid auto-rows-min gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card className="@container/card w-full">
              <CardHeader>
                <CardDescription>Receita Total</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  {formatValueToCurrency({
                    value: revenueSummary?.totalRevenue ?? 0,
                    includeCurrencySymbol: true,
                    normalizeDisplayValue: true,
                  })}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="@container/card">
              <CardHeader>
                <CardDescription>Total de vendas</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  {revenueSummary?.totalOrders ?? 0} pedidos
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="@container/card">
              <CardHeader>
                <CardDescription>Ticket médio</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  {revenueSummary?.averageOrderValue
                    ? formatValueToCurrency({
                        value: revenueSummary.averageOrderValue,
                        includeCurrencySymbol: true,
                        normalizeDisplayValue: true,
                      })
                    : '-'}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
          <SalesChannelBreakdown
            channels={revenueSummary?.channelBreakdowns ?? []}
            classificationNote={revenueSummary?.classificationNote}
            revenueTreatmentNote={revenueSummary?.revenueTreatmentNote}
          />
          <RevenueMultilineChart
            chartData={revenueSummary?.dailyBreakdowns ?? []}
            dates={{
              startDate: period.startDate,
              endDate: period.endDate,
            }}
            isLoading={isLoading}
          />
        </>
      </div>
    </>
  )
}
