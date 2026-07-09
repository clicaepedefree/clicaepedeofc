'use client'

import { getPublicOrderTracking } from '@/features/digital-menu/api'
import type { PublicOrderTrackingDto } from '@/features/digital-menu/types'
import { DarkModeToggle } from '@/features/theme/components/dark-mode-toggle'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { Skeleton } from '@/shared/skeleton'
import { useQuery } from '@tanstack/react-query'
import { Check, CheckCircle2, CircleAlert, Clock3, PackageCheck, RefreshCw, Store, Truck } from 'lucide-react'

type TrackingView = {
  displayId: string
  storeName: string
  status: string
  orderType?: string
  updatedAt?: string | Date
  estimatedMinutes?: number | null
  events: Array<{ status: string; occurredAt?: string | Date }>
}

const statusCopy: Record<string, { title: string; description: string }> = {
  RECEIVED: { title: 'Pedido recebido', description: 'A loja recebeu seu pedido.' },
  PENDING: { title: 'Aguardando a loja', description: 'Seu pedido esta na fila para confirmacao.' },
  CREATED: { title: 'Aguardando a loja', description: 'Seu pedido esta na fila para confirmacao.' },
  SENT_TO_STORE: { title: 'Enviado para a loja', description: 'A equipe ja pode visualizar seu pedido.' },
  ACCEPTED: { title: 'Em preparo', description: 'A loja confirmou e esta preparando seu pedido.' },
  IN_PREPARATION: { title: 'Em preparo', description: 'Seu pedido esta sendo preparado.' },
  READY: { title: 'Pedido pronto', description: 'Seu pedido esta pronto para a proxima etapa.' },
  OUT_FOR_DELIVERY: { title: 'Saiu para entrega', description: 'Seu pedido esta a caminho.' },
  COMPLETED: { title: 'Pedido finalizado', description: 'Tudo certo com este pedido.' },
  REJECTED: { title: 'Pedido nao aceito', description: 'A loja nao conseguiu atender este pedido.' },
  CANCELLED: { title: 'Pedido cancelado', description: 'Este pedido foi cancelado.' },
}

const progressStatuses = [
  'RECEIVED',
  'ACCEPTED',
  'IN_PREPARATION',
  'READY',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
]

const formatDateTime = (value?: string | Date) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : null

function normalizeTracking(data: PublicOrderTrackingDto): TrackingView {
  const value = data as unknown as Record<string, unknown>
  const rawEvents = Array.isArray(value.timeline) ? value.timeline : Array.isArray(value.events) ? value.events : []

  return {
    displayId: String(value.displayId ?? value.publicOrderId ?? ''),
    storeName: String(value.storeName ?? 'Loja'),
    status: String(value.status ?? 'RECEIVED'),
    orderType: typeof value.orderType === 'string' ? value.orderType : undefined,
    updatedAt: value.updatedAt as string | Date | undefined,
    estimatedMinutes: typeof value.estimatedMinutes === 'number'
      ? value.estimatedMinutes
      : typeof value.deliveryEstimatedMinutes === 'number' ? value.deliveryEstimatedMinutes : null,
    events: rawEvents.map(raw => {
      const event = raw as Record<string, unknown>
      return {
        status: String(event.status ?? event.toStatus ?? 'RECEIVED'),
        occurredAt: (event.occurredAt ?? event.createdAt) as string | Date | undefined,
      }
    }),
  }
}

const isTerminal = (status: string) => ['COMPLETED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(status)

export function PublicOrderTracking({ token }: { token: string }) {
  const query = useQuery({
    queryKey: ['public-order-tracking', token],
    queryFn: () => getPublicOrderTracking(token),
    refetchInterval: query => {
      const data = query.state.data
      return data && isTerminal(normalizeTracking(data).status) ? false : 15_000
    },
    retry: (count, error) => {
      const message = error instanceof Error ? error.message.toLowerCase() : ''
      return !message.includes('expir') && !message.includes('encontr') && count < 2
    },
  })

  const errorMessage = query.error instanceof Error ? query.error.message : ''
  const normalizedError = errorMessage.toLowerCase()
  const isExpired = normalizedError.includes('expir')
  const isNotFound = normalizedError.includes('encontr') || normalizedError.includes('invalid')

  if (query.isPending) return <TrackingLoading />
  if (query.isError) {
    return <TrackingState
      title={isExpired ? 'Link expirado' : isNotFound ? 'Pedido nao encontrado' : 'Nao foi possivel atualizar'}
      description={isExpired ? 'Este link de acompanhamento nao esta mais disponivel.' : isNotFound ? 'Confira se o link esta completo e tente novamente.' : 'Houve uma falha temporaria. Tente atualizar em instantes.'}
      retry={!isExpired && !isNotFound ? () => query.refetch() : undefined}
    />
  }

  if (!query.data) {
    return <TrackingState
      title="Link indisponivel ou expirado"
      description="Confira se o link esta completo. Por seguranca, links de acompanhamento deixam de funcionar depois do prazo informado pela loja."
    />
  }

  const order = normalizeTracking(query.data)
  const copy = statusCopy[order.status] ?? statusCopy.RECEIVED
  const cancelled = order.status === 'CANCELLED' || order.status === 'REJECTED'
  const currentIndex = progressStatuses.indexOf(order.status)
  const eventByStatus = new Map(order.events.map(event => [event.status, event]))

  return (
    <main className="min-h-dvh bg-muted/30 text-foreground">
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"><Store className="size-5" aria-hidden="true" /></span>
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{order.storeName}</p><p className="text-xs text-muted-foreground">Pedido #{order.displayId}</p></div>
          </div>
          <DarkModeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        <section aria-labelledby="tracking-title" className="border-b pb-8">
          <div className="flex items-start gap-4">
            <span className={`flex size-12 shrink-0 items-center justify-center rounded-md ${cancelled ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
              {cancelled ? <CircleAlert className="size-6" /> : <PackageCheck className="size-6" />}
            </span>
            <div>
              <Badge variant={cancelled ? 'destructive' : 'secondary'}>{order.orderType === 'TAKEOUT' ? 'Retirada' : 'Entrega'}</Badge>
              <h1 id="tracking-title" className="mt-3 text-2xl font-semibold sm:text-3xl">{copy.title}</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.description}</p>
              {order.estimatedMinutes ? <p className="mt-3 flex items-center gap-2 text-sm font-medium"><Clock3 className="size-4 text-primary" /> Previsao de {order.estimatedMinutes} minutos</p> : null}
            </div>
          </div>
        </section>

        {!cancelled && <section aria-labelledby="timeline-title" className="py-8">
          <h2 id="timeline-title" className="text-base font-semibold">Andamento</h2>
          <ol className="mt-6 space-y-0">
            {progressStatuses.map((status, index) => {
              const event = eventByStatus.get(status)
              const complete = index <= currentIndex || !!event
              const active = index === currentIndex
              const Icon = status === 'COMPLETED' ? CheckCircle2 : status === 'READY' || status === 'OUT_FOR_DELIVERY' ? Truck : complete ? Check : Clock3
              return <li key={status} className="relative flex min-h-20 gap-4 last:min-h-0">
                {index < progressStatuses.length - 1 && <span className={`absolute left-[15px] top-8 h-[calc(100%-1rem)] w-px ${complete ? 'bg-primary' : 'bg-border'}`} />}
                <span className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border ${complete ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'}`}><Icon className="size-4" aria-hidden="true" /></span>
                <div className="pb-5"><p className={`text-sm font-medium ${active ? 'text-primary' : ''}`}>{statusCopy[status]?.title}</p><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(event?.occurredAt) ?? (active ? 'Etapa atual' : complete ? 'Concluida' : 'Aguardando')}</p></div>
              </li>
            })}
          </ol>
        </section>}

        <footer className="flex flex-col gap-3 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite">{query.isFetching ? 'Atualizando andamento...' : `Atualizado ${formatDateTime(order.updatedAt) ?? 'agora'}`}</p>
          <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className={`size-4 ${query.isFetching ? 'animate-spin' : ''}`} /> Atualizar</Button>
        </footer>
      </div>
    </main>
  )
}

function TrackingLoading() {
  return <main className="min-h-dvh bg-muted/30 px-4 py-12" aria-busy="true" aria-live="polite"><span className="sr-only">Carregando acompanhamento do pedido</span><div className="mx-auto max-w-3xl space-y-8"><Skeleton className="h-14 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-72 w-full" /></div></main>
}

function TrackingState({ title, description, retry }: { title: string; description: string; retry?: () => void }) {
  return <main className="flex min-h-dvh items-center justify-center bg-muted/30 px-4 text-center"><section className="max-w-md" role="alert" aria-live="assertive"><span className="mx-auto flex size-12 items-center justify-center rounded-md bg-muted text-muted-foreground"><CircleAlert className="size-6" /></span><h1 className="mt-5 text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>{retry && <Button className="mt-5" variant="outline" onClick={retry}><RefreshCw className="size-4" /> Tentar novamente</Button>}</section></main>
}
