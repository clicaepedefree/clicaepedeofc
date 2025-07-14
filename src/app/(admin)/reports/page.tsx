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
import { LoadingSpinner } from '@/shared/spinner'
import { Body } from '@/shared/typography/body'
import { useState } from 'react'

export default function Page() {
  const [selectedPeriod, setSelectedPeriod] =
    useState<ReportPeriod>('LAST_30_DAYS')

  const { revenueSummary, isLoading, isEnabled, dates } =
    useRevenueSummary(selectedPeriod)

  return (
    <>
      <AdminPageInfo pageInfo={{ title: 'Desempenho de Vendas' }} />
      <div className="p-4 max-w-[inherit]">
        <div className="flex items-center justify-between gap-4 w-full mb-4">
          <div className="min-w-52">
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
        {(isLoading || !isEnabled) && <LoadingSpinner />}
        {!isLoading && isEnabled && !revenueSummary?.dailyBreakdowns && (
          <Body variant={100} className="w-full text-center py-4">
            Loja não possui vendas para o período
          </Body>
        )}
        {!!revenueSummary?.dailyBreakdowns && (
          <>
            <div className="grid auto-rows-min gap-4 md:grid-cols-3 mb-4">
              <Card className="@container/card w-full">
                <CardHeader className="w-fit">
                  <CardDescription>Receita Total</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                    {formatValueToCurrency({
                      value: revenueSummary.totalRevenue ?? 0,
                      includeCurrencySymbol: true,
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
                    })}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>
            {revenueSummary.dailyBreakdowns && (
              <RevenueMultilineChart
                chartData={revenueSummary.dailyBreakdowns}
                dates={dates}
              />
            )}
          </>
        )}
      </div>
    </>
  )
}
