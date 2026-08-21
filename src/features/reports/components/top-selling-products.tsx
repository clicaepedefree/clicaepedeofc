'use client'

import type { TopSellingProduct } from '@/features/reports/sales-channel-metrics'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/card'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { cn } from '@/shared/lib/utils'
import { BadgeCheck, Boxes, Trophy } from 'lucide-react'

type TopSellingProductsProps = {
  products: TopSellingProduct[]
  className?: string
}

const formatQuantity = (quantity: string) => {
  const value = Number(quantity)

  if (!Number.isFinite(value)) return '0'

  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value)
}

export function TopSellingProducts({
  products,
  className,
}: TopSellingProductsProps) {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Produtos mais vendidos</CardTitle>
            <CardDescription>
              Ranking dos cinco itens com maior quantidade vendida no período.
            </CardDescription>
          </div>
          <div className="hidden rounded-md border bg-muted/40 p-2 text-primary sm:block">
            <Trophy className="size-5" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {products.length ? (
          <ol className="space-y-3">
            {products.map((product, index) => (
              <li
                key={`${product.itemId}-${product.itemName}`}
                className="grid gap-3 rounded-md border bg-background/60 p-4 shadow-sm dark:bg-muted/20 md:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="flex min-w-0 gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold leading-tight">
                      {product.itemName}
                    </h3>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <BadgeCheck className="size-3.5 text-primary" />
                      Canal predominante: {product.predominantChannelLabel}
                    </p>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm md:min-w-64">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Quantidade
                    </dt>
                    <dd className="mt-1 font-semibold tabular-nums">
                      {formatQuantity(product.quantity)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Faturamento
                    </dt>
                    <dd className="mt-1 font-semibold tabular-nums">
                      {formatValueToCurrency({
                        value: product.revenue,
                        includeCurrencySymbol: true,
                        normalizeDisplayValue: true,
                      })}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex min-h-36 flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center">
            <Boxes className="size-8 text-muted-foreground" />
            <p className="mt-3 font-medium">
              Nenhum produto vendido no período
            </p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Assim que pedidos concluídos entrarem no período selecionado, os
              cinco produtos com melhor desempenho aparecem aqui.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
