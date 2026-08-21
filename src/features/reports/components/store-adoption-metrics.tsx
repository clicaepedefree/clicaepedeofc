'use client'

import type { StoreAdoptionMetrics } from '@/features/reports/sales-channel-metrics'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/card'
import { formatDate } from '@/shared/formatters/date'
import { cn } from '@/shared/lib/utils'
import {
  CalendarClock,
  ClipboardList,
  PackageCheck,
  PackagePlus,
  Users,
} from 'lucide-react'

type StoreAdoptionMetricsProps = {
  metrics?: StoreAdoptionMetrics | null
  className?: string
}

const formatDateTime = (date?: Date | string | null) =>
  date ? formatDate(date, 'DD/MM/YYYY HH:mm') : '-'

const metricItems = (metrics: StoreAdoptionMetrics) => [
  {
    label: 'Produtos cadastrados',
    value: metrics.registeredProducts,
    description: `${metrics.activeProducts} ativos no cardapio`,
    icon: PackagePlus,
  },
  {
    label: 'Clientes totais',
    value: metrics.totalCustomers,
    description: `${metrics.newCustomersInPeriod} novos no periodo`,
    icon: Users,
  },
  {
    label: 'Ultima venda',
    value: formatDateTime(metrics.lastSaleAt),
    description: 'Pedido concluido mais recente',
    icon: PackageCheck,
  },
  {
    label: 'Ultimo acesso',
    value: formatDateTime(metrics.lastAccessAt),
    description: 'Administrador ativo mais recente',
    icon: CalendarClock,
  },
]

export function StoreAdoptionMetrics({
  metrics,
  className,
}: StoreAdoptionMetricsProps) {
  const resolvedMetrics =
    metrics ??
    ({
      registeredProducts: 0,
      activeProducts: 0,
      totalCustomers: 0,
      newCustomersInPeriod: 0,
      lastSaleAt: null,
      lastAccessAt: null,
      uniqueCustomerCriteria:
        'Cliente unico = telefone normalizado; quando telefone nao existe, documento normalizado. Pedidos sem telefone e sem documento nao entram nessa contagem.',
    } satisfies StoreAdoptionMetrics)

  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Adoção da loja</CardTitle>
            <CardDescription>
              Tamanho da operação, base de clientes e atividade recente.
            </CardDescription>
          </div>
          <div className="hidden rounded-md border bg-muted/40 p-2 text-primary sm:block">
            <ClipboardList className="size-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metricItems(resolvedMetrics).map(item => {
            const Icon = item.icon

            return (
              <article
                key={item.label}
                className="rounded-md border bg-background/60 p-4 shadow-sm dark:bg-muted/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase text-muted-foreground">
                      {item.label}
                    </p>
                    <p className="mt-2 text-2xl font-semibold tabular-nums">
                      {item.value}
                    </p>
                  </div>
                  <Icon className="mt-0.5 size-5 shrink-0 text-primary" />
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {item.description}
                </p>
              </article>
            )
          })}
        </div>
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
          {resolvedMetrics.uniqueCustomerCriteria}
        </p>
      </CardContent>
    </Card>
  )
}
