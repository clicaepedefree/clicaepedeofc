'use client'

import type { DigitalMenuPublicationStatus } from '@/features/digital-menu/admin'
import { useDigitalMenuAdmin } from '@/features/digital-menu/hooks/use-digital-menu-admin'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/alert-dialog'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/card'
import { formatValueToCurrency } from '@/shared/formatters/currency'
import { dispatchToast } from '@/shared/lib/toast'
import { stripAdminSubdomain } from '@/shared/lib/domain-config'
import { Skeleton } from '@/shared/skeleton'
import {
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  MapPin,
  PackageOpen,
  Pause,
  Play,
  Store,
  Truck,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const statusContent: Record<
  DigitalMenuPublicationStatus,
  { label: string; description: string; className: string }
> = {
  DRAFT: {
    label: 'Rascunho',
    description: 'Somente administradores conseguem abrir a previa.',
    className: 'border-border bg-muted text-muted-foreground',
  },
  PUBLISHED: {
    label: 'Publicado',
    description: 'A vitrine esta disponivel no link publico.',
    className:
      'border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  PAUSED: {
    label: 'Pausado',
    description: 'A vitrine esta temporariamente indisponivel para clientes.',
    className:
      'border-amber-600/25 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  },
}

const money = (value: string | null) =>
  value === null
    ? 'Nao configurada'
    : formatValueToCurrency({ value, includeCurrencySymbol: true })

export const DigitalMenuAdmin = () => {
  const {
    selectedStoreId,
    data,
    isLoading,
    isError,
    updatePublication,
    isUpdatingPublication,
  } = useDigitalMenuAdmin()
  const [publicUrl, setPublicUrl] = useState(data?.publicPath ?? '')

  useEffect(() => {
    if (!data) return
    const hostname = stripAdminSubdomain(window.location.host)
    setPublicUrl(`${window.location.protocol}//${hostname}${data.publicPath}`)
  }, [data])

  const copyPublicLink = async () => {
    if (!data) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      dispatchToast({ type: 'success', message: 'Link copiado.' })
    } catch {
      dispatchToast({
        type: 'error',
        message: 'Nao foi possivel copiar. Copie o link manualmente.',
      })
    }
  }

  if (!selectedStoreId) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Selecione uma loja para gerenciar o Cardapio Digital.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-44 w-full" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-36 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        Nao foi possivel carregar a central desta loja.
      </div>
    )
  }

  const status = statusContent[data.publicationStatus]
  const readyItems = data.readiness.filter(item => item.ready).length

  return (
    <main className="space-y-6 p-4 lg:p-6">
      <section className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="grid gap-6 p-5 lg:grid-cols-[1fr_auto] lg:items-start lg:p-6">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Store className="size-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Vitrine de {data.store.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={status.className}>
                    {status.label}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {status.description}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-sm text-muted-foreground">
                {publicUrl}
              </span>
              <Button
                variant="icon"
                size="icon"
                onClick={copyPublicLink}
                aria-label="Copiar link publico"
                title="Copiar link publico"
              >
                <Copy className="size-4" />
              </Button>
              <Button
                variant="icon"
                size="icon"
                asChild
                title="Abrir link publico"
              >
                <a href={data.publicPath} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  <span className="sr-only">Abrir link publico</span>
                </a>
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
            <Button variant="outline" asChild>
              <Link href={data.previewPath} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
                Abrir previa
              </Link>
            </Button>
            {data.publicationStatus === 'PUBLISHED' ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={isUpdatingPublication}>
                    <Pause className="size-4" />
                    Pausar cardapio
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Pausar o Cardapio Digital?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Os clientes nao poderao acessar a vitrine nem iniciar
                      novos pedidos ate que ela seja publicada novamente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => updatePublication({ action: 'PAUSE' })}
                    >
                      Pausar cardapio
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button
                onClick={() => updatePublication({ action: 'PUBLISH' })}
                isLoading={isUpdatingPublication}
                disabled={!data.canPublish}
                title={
                  data.canPublish
                    ? 'Publicar Cardapio Digital'
                    : 'Conclua as pendencias obrigatorias antes de publicar'
                }
              >
                <Play className="size-4" />
                {data.publicationStatus === 'PAUSED'
                  ? 'Publicar novamente'
                  : 'Publicar cardapio'}
              </Button>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="readiness-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="readiness-title" className="text-lg font-semibold">
              Preparacao da vitrine
            </h2>
            <p className="text-sm text-muted-foreground">
              {readyItems} de {data.readiness.length} pontos configurados.
            </p>
          </div>
          {!data.canPublish && (
            <Badge
              variant="outline"
              className="border-amber-500/30 text-amber-700 dark:text-amber-300"
            >
              Existem pendencias obrigatorias
            </Badge>
          )}
        </div>
        <div className="divide-y overflow-hidden rounded-lg border bg-card">
          {data.readiness.map(item => (
            <div
              key={item.id}
              className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 gap-3">
                {item.ready ? (
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <XCircle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
                )}
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="self-start sm:self-auto"
              >
                <Link href={item.href}>{item.actionLabel}</Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="summary-title" className="space-y-3">
        <div>
          <h2 id="summary-title" className="text-lg font-semibold">
            Resumo operacional
          </h2>
          <p className="text-sm text-muted-foreground">
            Consulte as regras atuais e edite cada detalhe na configuracao da
            loja.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            icon={Truck}
            title="Atendimento"
            value={
              [
                data.summary.deliveryEnabled && 'Delivery',
                data.summary.takeoutEnabled && 'Retirada',
              ]
                .filter(Boolean)
                .join(' e ') || 'Nao configurado'
            }
            detail={`${data.summary.activeDeliveryZones} regiao(oes) de entrega`}
            href="/settings/store#digital-menu-delivery"
          />
          <SummaryCard
            icon={PackageOpen}
            title="Pedido minimo"
            value={money(data.summary.minimumOrderAmount)}
            detail={`${data.summary.availableProducts} produto(s) disponivel(is)`}
            href="/settings/store#digital-menu-delivery"
          />
          <SummaryCard
            icon={MapPin}
            title="Taxa de entrega"
            value={money(data.summary.deliveryFeeFrom)}
            detail="Menor taxa entre regioes ativas"
            href="/settings/store#digital-menu-delivery"
          />
          <SummaryCard
            icon={CreditCard}
            title="Pagamentos"
            value={
              data.summary.paymentMethods
                .map(method => method.label)
                .join(', ') || 'Nao configurado'
            }
            detail={`${data.summary.paymentMethods.length} metodo(s) ativo(s)`}
            href="/settings/store#digital-menu-payments"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock3 className="size-4" />
          {data.summary.activeBusinessHours} faixa(s) de horario ativa(s).
          <Link
            className="font-medium text-primary hover:underline"
            href="/settings/store#digital-menu-hours"
          >
            Editar horarios
          </Link>
        </div>
      </section>
    </main>
  )
}

const SummaryCard = ({
  icon: Icon,
  title,
  value,
  detail,
  href,
}: {
  icon: typeof Truck
  title: string
  value: string
  detail: string
  href: string
}) => (
  <Card className="gap-4 py-5 shadow-none hover:shadow-none">
    <CardHeader className="grid-cols-[auto_1fr] items-center gap-3 px-5">
      <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
    </CardHeader>
    <CardContent className="space-y-2 px-5">
      <p className="line-clamp-2 text-base font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
      <Link
        className="text-sm font-medium text-primary hover:underline"
        href={href}
      >
        Editar
      </Link>
    </CardContent>
  </Card>
)
