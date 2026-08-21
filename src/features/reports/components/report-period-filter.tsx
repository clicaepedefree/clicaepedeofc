'use client'

import {
  maxAllTimeDailyBreakdownDays,
  maxBoundedReportRangeDays,
  reportPeriodPresets,
  type ReportPeriodPreset,
  type ReportPeriodSelection,
  type ResolvedReportPeriod,
} from '@/features/reports/form-validation/report-period'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { Tabs, TabsList, TabsTrigger } from '@/shared/tabs'
import { CalendarDays } from 'lucide-react'

type ReportPeriodFilterProps = {
  value: ReportPeriodSelection
  period: ResolvedReportPeriod
  onChange: (value: ReportPeriodSelection) => void
  disabled?: boolean
  className?: string
}

export function ReportPeriodFilter({
  value,
  period,
  onChange,
  disabled,
  className,
}: ReportPeriodFilterProps) {
  const handlePresetChange = (preset: string) => {
    onChange({
      ...value,
      preset: preset as ReportPeriodPreset,
    })
  }

  return (
    <section
      className={cn(
        'rounded-md border bg-card p-3 shadow-sm dark:bg-card/80',
        className
      )}
      aria-label="Filtro de período do relatório"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="size-4 text-primary" />
            Período de análise
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Atalhos usam o fuso operacional da loja. Personalizado aceita até{' '}
            {maxBoundedReportRangeDays} dias.
          </p>
        </div>
        <Tabs value={value.preset} onValueChange={handlePresetChange}>
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/60 p-1 xl:w-fit">
            {reportPeriodPresets.map(preset => (
              <TabsTrigger
                key={preset.value}
                value={preset.value}
                disabled={disabled}
                className="min-h-8 flex-none px-3"
                title={preset.description}
              >
                {preset.shortLabel}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {value.preset === 'CUSTOM' && (
        <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
          <Label size="sm" className="gap-2">
            Início
            <Input
              type="date"
              value={value.customStartDate ?? ''}
              disabled={disabled}
              onChange={event =>
                onChange({
                  ...value,
                  customStartDate: event.target.value,
                })
              }
            />
          </Label>
          <Label size="sm" className="gap-2">
            Fim
            <Input
              type="date"
              value={value.customEndDate ?? ''}
              disabled={disabled}
              onChange={event =>
                onChange({
                  ...value,
                  customEndDate: event.target.value,
                })
              }
            />
          </Label>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          {period.isAllTime
            ? `Cards consideram todos os pedidos elegíveis; gráfico diário limita os últimos ${maxAllTimeDailyBreakdownDays} dias.`
            : period.startDate && period.endDate
              ? `De ${period.startDate} até ${period.endDate}.`
              : period.label}
        </span>
        <span>Fuso: {period.timeZone}</span>
      </div>

      {!period.isRangeValid && period.validationMessage && (
        <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {period.validationMessage}
        </p>
      )}
    </section>
  )
}
