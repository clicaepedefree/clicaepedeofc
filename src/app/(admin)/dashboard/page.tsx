'use client'

import { AdminPageInfo } from '@/features/admin/components/admin-page-info'
import { RevenueMultilineChart } from '@/features/reports/components/revenue-multiline-chart'
import {
  reportPeriodsOptions,
  type ReportPeriod,
} from '@/features/reports/form-validation/report-period'
import { useRevenueSummary } from '@/features/reports/hooks/use-revenue-report'
import { Card, CardDescription, CardHeader, CardTitle } from '@/shared/card'
import { Combobox } from '@/shared/combobox'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { useState } from 'react'

export default function Page() {
  const [selectedPeriod, setSelectedPeriod] =
    useState<ReportPeriod>('LAST_30_DAYS')

  const { revenueSummary, isLoading, isEnabled, dates } =
    useRevenueSummary(selectedPeriod)

  return (
    <>
      <AdminPageInfo pageInfo={{ title: 'Dashboard' }} />
      <div className="w-full max-w-[inherit] space-y-4 p-4 md:p-6">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:w-64">
            <Combobox
              options={[...reportPeriodsOptions]}
              value={selectedPeriod}
              onChange={(value: string) =>
                setSelectedPeriod(value as ReportPeriod)
              }
              placeholder="Selecione um período"
              searchPlaceholder="Buscar período"
              noResultMessage="Nenhum período encontrado"
              disabled={isLoading}
              disableUnselectingOption
              contentClassName="min-w-fit"
            />
          </div>
        </div>
        <>
          <div className="mb-4 grid auto-rows-min gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Card className="@container/card w-full">
              <CardHeader>
                <CardDescription>Receita Total</CardDescription>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  {formatValueToCurrency({
                    value: revenueSummary?.totalRevenue ?? 0,
                    includeCurrencySymbol: true,
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
                      })
                    : '-'}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
          <RevenueMultilineChart
            chartData={revenueSummary?.dailyBreakdowns ?? []}
            dates={dates}
            isLoading={isLoading}
          />
        </>
      </div>
    </>
  )
}
