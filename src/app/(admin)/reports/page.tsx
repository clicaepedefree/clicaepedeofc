'use client'

import { AdminPageInfo } from '@/features/admin/components/admin-page-info'
import { ReportPeriodFilter } from '@/features/reports/components/report-period-filter'
import { RevenueMultilineChart } from '@/features/reports/components/revenue-multiline-chart'
import { SalesChannelBreakdown } from '@/features/reports/components/sales-channel-breakdown'
import type { ReportPeriodSelection } from '@/features/reports/form-validation/report-period'
import { useRevenueSummary } from '@/features/reports/hooks/use-revenue-report'
import { Card, CardDescription, CardHeader, CardTitle } from '@/shared/card'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { LoadingSpinner } from '@/shared/spinner'
import { Body } from '@/shared/typography/body'
import { useState } from 'react'

export default function Page() {
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriodSelection>({
    preset: 'LAST_7_DAYS',
  })

  const { revenueSummary, isLoading, isEnabled, period } =
    useRevenueSummary(selectedPeriod)

  return (
    <>
      <AdminPageInfo pageInfo={{ title: 'Relatórios' }} />
      <div className="p-4 max-w-[inherit]">
        <ReportPeriodFilter
          value={selectedPeriod}
          period={period}
          onChange={setSelectedPeriod}
          disabled={isLoading}
          className="mb-4"
        />
        {!period.isRangeValid && (
          <Body variant={100} className="w-full text-center py-4">
            Ajuste o período para consultar os indicadores.
          </Body>
        )}
        {(isLoading || !isEnabled) && period.isRangeValid && <LoadingSpinner />}
        {!isLoading &&
          isEnabled &&
          period.isRangeValid &&
          !revenueSummary?.totalOrders && (
          <Body variant={100} className="w-full text-center py-4">
            Loja não possui vendas para o período
          </Body>
        )}
        {!!revenueSummary?.totalOrders && (
          <>
            <div className="grid auto-rows-min gap-4 md:grid-cols-3 mb-4">
              <Card className="@container/card w-full">
                <CardHeader className="w-fit">
                  <CardDescription>Receita Total</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {formatValueToCurrency({
                      value: revenueSummary.totalRevenue ?? 0,
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
                    {revenueSummary.totalOrders} pedidos
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="@container/card">
                <CardHeader>
                  <CardDescription>Ticket médio</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {formatValueToCurrency({
                      value: revenueSummary.averageOrderValue ?? 0,
                      includeCurrencySymbol: true,
                      normalizeDisplayValue: true,
                    })}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>
            {!!revenueSummary.dailyBreakdowns.length && (
              <div className="space-y-4">
                <SalesChannelBreakdown
                  channels={revenueSummary.channelBreakdowns ?? []}
                  classificationNote={revenueSummary.classificationNote}
                  revenueTreatmentNote={revenueSummary.revenueTreatmentNote}
                />
                <RevenueMultilineChart
                  chartData={revenueSummary.dailyBreakdowns}
                  dates={{
                    startDate: period.startDate,
                    endDate: period.endDate,
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
