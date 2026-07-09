'use client'

import { getPublicOrderTracking } from '@/features/digital-menu/api'
import type { PublicOrderTrackingDto } from '@/features/digital-menu/types'
import { DarkModeToggle } from '@/features/theme/components/dark-mode-toggle'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { Skeleton } from '@/shared/skeleton'
import { useQuery } from '@tanstack/react-query'
import { Check, CheckCircle2, CircleAlert, Clock3, Copy, MessageCircle, PackageCheck, RefreshCw, Store, Truck } from 'lucide-react'
import { useState } from 'react'

type TrackingView = {
  displayId: string
  storeName: string
  status: string
  orderType?: string
  updatedAt?: string | Date
  total: string
  payment: PublicOrderTrackingDto['payment']
  orderSummary: PublicOrderTrackingDto['orderSummary']
  estimatedMinutes?: number | null
  events: Array<{ status: string; occurredAt?: string | Date }>
}

const statusCopy: Record<string, { title: string; delivery: string; takeout: string }> = {
  RECEIVED: { title: 'Pedido recebido', delivery: 'Recebemos seu pedido e avisamos a loja.', takeout: 'Recebemos seu pedido e avisamos a loja.' },
  PENDING: { title: 'Aguardando confirmacao', delivery: 'A loja vai confirmar se consegue preparar e entregar seu pedido.', takeout: 'A loja vai confirmar se consegue preparar seu pedido para retirada.' },
  CREATED: { title: 'Aguardando confirmacao', delivery: 'A loja vai confirmar se consegue preparar e entregar seu pedido.', takeout: 'A loja vai confirmar se consegue preparar seu pedido para retirada.' },
  SENT_TO_STORE: { title: 'Enviado para a loja', delivery: 'Seu pedido ja esta disponivel para a equipe da loja.', takeout: 'Seu pedido ja esta disponivel para a equipe da loja.' },
  ACCEPTED: { title: 'Pedido aceito', delivery: 'A loja confirmou seu pedido e vai iniciar o preparo.', takeout: 'A loja confirmou seu pedido e vai iniciar o preparo.' },
  IN_PREPARATION: { title: 'Em preparo', delivery: 'Seu pedido esta sendo preparado para entrega.', takeout: 'Seu pedido esta sendo preparado para retirada.' },
  READY: { title: 'Pronto para retirada', delivery: 'Seu pedido esta pronto para sair para entrega.', takeout: 'Seu pedido esta pronto para retirada no balcao.' },
  OUT_FOR_DELIVERY: { title: 'Saiu para entrega', delivery: 'Seu pedido saiu da loja e esta a caminho.', takeout: 'Seu pedido esta pronto para retirada.' },
  COMPLETED: { title: 'Pedido finalizado', delivery: 'Tudo certo com este pedido. Obrigado por comprar com a loja.', takeout: 'Tudo certo com este pedido. Obrigado por comprar com a loja.' },
  REJECTED: { title: 'Pedido nao aceito', delivery: 'A loja nao conseguiu atender este pedido. Se ja combinou pagamento, fale com a loja.', takeout: 'A loja nao conseguiu atender este pedido. Se ja combinou pagamento, fale com a loja.' },
  CANCELLED: { title: 'Pedido cancelado', delivery: 'Este pedido foi cancelado. Se precisar, entre em contato com a loja.', takeout: 'Este pedido foi cancelado. Se precisar, entre em contato com a loja.' },
}

const deliveryProgressStatuses = ['RECEIVED', 'PENDING', 'ACCEPTED', 'IN_PREPARATION', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED']
const takeoutProgressStatuses = ['RECEIVED', 'PENDING', 'ACCEPTED', 'IN_PREPARATION', 'READY', 'COMPLETED']

const formatDateTime = (value?: string | Date) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : null

const currency = (value: string) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value))

function normalizeTracking(data: PublicOrderTrackingDto): TrackingView {
  const value = data as unknown as Record<string, unknown>
  const rawEvents = Array.isArray(value.timeline) ? value.timeline : Array.isArray(value.events) ? value.events : []

  return {
    displayId: String(value.displayId ?? ''),
    storeName: String(value.storeName ?? 'Loja'),
    status: String(value.status ?? 'RECEIVED'),
    orderType: typeof value.orderType === 'string' ? value.orderType : undefined,
    updatedAt: value.updatedAt as string | Date | undefined,
    total: String(value.total ?? '0'),
    payment: data.payment ?? null,
    orderSummary: data.orderSummary ?? [],
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
const publicStageStatus = (status: string) =>
  ['PENDING', 'CREATED', 'SENT_TO_STORE'].includes(status) ? 'PENDING' : status

export function PublicOrderTracking({ token }: { token: string }) {
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
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
  const progressStatuses = order.orderType === 'TAKEOUT'
    ? takeoutProgressStatuses
    : deliveryProgressStatuses
  const currentIndex = progressStatuses.indexOf(publicStageStatus(order.status))
  const eventByStatus = new Map(order.events.map(event => [publicStageStatus(event.status), event]))
  const trackingUrl = typeof window === 'undefined' ? `/pedido/${token}` : window.location.href
  const whatsappText = encodeURIComponent(
    `Ola, quero acompanhar o pedido #${order.displayId} da ${order.storeName}. Link: ${trackingUrl}`
  )
  const whatsappShareUrl = `https://wa.me/?text=${whatsappText}`
  const copyTrackingLink = async () => {
    try {
      await navigator.clipboard.writeText(trackingUrl)
      setCopyMessage('Link copiado.')
    } catch {
      setCopyMessage('Nao foi possivel copiar automaticamente.')
    }
  }

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
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{order.orderType === 'TAKEOUT' ? copy.takeout : copy.delivery}</p>
              {order.estimatedMinutes ? <p className="mt-3 flex items-center gap-2 text-sm font-medium"><Clock3 className="size-4 text-primary" /> Previsao de {order.estimatedMinutes} minutos</p> : null}
              <div className="mt-5 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={copyTrackingLink}><Copy className="size-4" /> Copiar link</Button>
                <Button asChild type="button" variant="outline" size="sm"><a href={whatsappShareUrl} target="_blank" rel="noreferrer"><MessageCircle className="size-4" /> Enviar WhatsApp</a></Button>
              </div>
              {copyMessage && <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">{copyMessage}</p>}
            </div>
          </div>
        </section>

        <section aria-labelledby="summary-title" className="grid gap-3 border-b py-6 sm:grid-cols-2">
          <div className="rounded-md border bg-card p-4">
            <h2 id="summary-title" className="text-sm font-semibold">Resumo do pedido</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {order.orderSummary.map((item, index) => (
                <li key={`${item.name}-${index}`} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{item.quantity}x {item.name}</span>
                </li>
              ))}
              {!order.orderSummary.length && <li className="text-muted-foreground">Resumo indisponivel.</li>}
            </ul>
          </div>
          <div className="rounded-md border bg-card p-4">
            <h2 className="text-sm font-semibold">Pagamento</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Total</dt><dd className="font-semibold">{currency(order.total)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Forma</dt><dd className="font-medium">{order.payment?.label ?? 'Nao informada'}</dd></div>
            </dl>
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
        <div className="sticky bottom-3 mt-6 grid grid-cols-3 gap-2 rounded-md border bg-background/95 p-2 shadow-lg backdrop-blur sm:hidden">
          <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw className={`size-4 ${query.isFetching ? 'animate-spin' : ''}`} /><span className="sr-only">Atualizar</span></Button>
          <Button variant="outline" size="sm" onClick={copyTrackingLink}><Copy className="size-4" /> Copiar</Button>
          <Button asChild variant="outline" size="sm"><a href={whatsappShareUrl} target="_blank" rel="noreferrer"><MessageCircle className="size-4" /> WhatsApp</a></Button>
        </div>
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
