import { formatValueToCurrency } from '@/shared/formatters/currency'
import { cn } from '@/shared/lib/utils'
import { MessageCircle } from 'lucide-react'
import { useId } from 'react'

export type WhatsappCtaMetrics = {
  accesses: number
  carts: number
  ordersCreated: number
  ordersCompleted: number
  ordersCancelled: number
  completedRevenue: string
  otherIntegrationOrders: number
  attributedOrdersWithoutAccess: number
  retentionDays: 30
}

type WhatsappCtaAttributionProps = {
  metrics?: WhatsappCtaMetrics | null
  className?: string
}

const unavailable = 'Indisponivel'
const formatCount = (value: number | undefined) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value.toLocaleString('pt-BR')
    : unavailable

export function WhatsappCtaAttribution({
  metrics,
  className,
}: WhatsappCtaAttributionProps) {
  const headingId = useId()
  const descriptionId = useId()
  const revenue = metrics?.completedRevenue
  const completedRevenue =
    typeof revenue === 'string' &&
    /^\d+(\.\d+)?$/.test(revenue) &&
    Number.isFinite(Number(revenue))
      ? formatValueToCurrency({
          value: revenue,
          includeCurrencySymbol: true,
          normalizeDisplayValue: true,
        })
      : unavailable
  const primaryMetrics = [
    ['Acessos medidos', formatCount(metrics?.accesses)],
    ['Carrinhos iniciados', formatCount(metrics?.carts)],
    ['Pedidos gerados', formatCount(metrics?.ordersCreated)],
    ['Pedidos concluidos', formatCount(metrics?.ordersCompleted)],
    ['Pedidos cancelados', formatCount(metrics?.ordersCancelled)],
    ['Receita concluida', completedRevenue],
  ]
  const separateMetrics = [
    [
      'Pedidos de outras integracoes',
      formatCount(metrics?.otherIntegrationOrders),
    ],
    [
      'Pedidos atribuidos sem acesso medido',
      formatCount(metrics?.attributedOrdersWithoutAccess),
    ],
  ]

  return (
    <section
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      className={cn('min-w-0 space-y-4 border-y py-4', className)}
    >
      <div className="flex items-start gap-2">
        <MessageCircle
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0">
          <h2 id={headingId} className="text-base font-semibold">
            Origem WhatsApp
          </h2>
          <p id={descriptionId} className="text-sm text-muted-foreground">
            Acessos consentidos nos ultimos 30 dias. Nao representam pessoas
            unicas.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pedidos criados no periodo selecionado. Acessos e carrinhos
            limitados aos ultimos 30 dias.
          </p>
        </div>
      </div>
      {!metrics ? (
        <p role="status" className="text-sm text-muted-foreground">
          Dados de origem WhatsApp indisponiveis.
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
            {primaryMetrics.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-words text-xl font-semibold tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
          <dl className="grid grid-cols-1 gap-4 border-t pt-4 sm:grid-cols-2">
            {separateMetrics.map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-words font-semibold tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  )
}
