'use client'

import type { OperationalSalesChannelBreakdown } from '@/features/reports/sales-channel-metrics'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/card'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { cn } from '@/shared/lib/utils'
import { BadgeCheck, CircleDollarSign, Info, ReceiptText } from 'lucide-react'

type SalesChannelBreakdownProps = {
  channels: OperationalSalesChannelBreakdown[]
  classificationNote?: string
  revenueTreatmentNote?: string
  className?: string
}

export function SalesChannelBreakdown({
  channels,
  classificationNote,
  revenueTreatmentNote,
  className,
}: SalesChannelBreakdownProps) {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Desempenho por canal</CardTitle>
            <CardDescription>
              Vendas, faturamento e ticket medio separados pela origem
              operacional.
            </CardDescription>
          </div>
          <div className="hidden rounded-md border bg-muted/40 p-2 text-primary sm:block">
            <CircleDollarSign className="size-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {channels.map(channel => (
            <article
              key={channel.key}
              className="rounded-md border bg-background/60 p-4 shadow-sm dark:bg-muted/20"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold leading-tight">
                    {channel.label}
                  </h3>
                  <p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">
                    {channel.description}
                  </p>
                </div>
                <ReceiptText className="mt-0.5 size-4 shrink-0 text-primary" />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Vendas</dt>
                  <dd className="mt-1 font-semibold tabular-nums">
                    {channel.orders}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Faturamento</dt>
                  <dd className="mt-1 font-semibold tabular-nums">
                    {formatValueToCurrency({
                      value: channel.revenue,
                      includeCurrencySymbol: true,
                      normalizeDisplayValue: true,
                    })}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-muted-foreground">
                    Ticket medio
                  </dt>
                  <dd className="mt-1 font-semibold tabular-nums">
                    {channel.orders
                      ? formatValueToCurrency({
                          value: channel.averageOrderValue,
                          includeCurrencySymbol: true,
                          normalizeDisplayValue: true,
                        })
                      : '-'}
                  </dd>
                </div>
              </dl>
              <p className="mt-4 rounded-md bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground">
                {channel.treatment}
              </p>
            </article>
          ))}
        </div>
        {(classificationNote || revenueTreatmentNote) && (
          <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
            {classificationNote && (
              <div className="flex gap-2 rounded-md border bg-muted/30 p-3">
                <BadgeCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <p>{classificationNote}</p>
              </div>
            )}
            {revenueTreatmentNote && (
              <div className="flex gap-2 rounded-md border bg-muted/30 p-3">
                <Info className="mt-0.5 size-4 shrink-0 text-primary" />
                <p>{revenueTreatmentNote}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
