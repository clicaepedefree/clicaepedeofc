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
import { Input } from '@/shared/input'
import { dispatchToast } from '@/shared/lib/toast'
import { stripAdminSubdomain } from '@/shared/lib/domain-config'
import { Skeleton } from '@/shared/skeleton'
import { Switch } from '@/shared/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/table'
import { Textarea } from '@/shared/textarea'
import {
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  Gift,
  ExternalLink,
  Edit3,
  MapPin,
  PackageOpen,
  Pause,
  Percent,
  Play,
  Save,
  Store,
  Trash2,
  Truck,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'

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

type PromotionType =
  | 'FIXED_AMOUNT'
  | 'PERCENTAGE'
  | 'FREE_DELIVERY'
  | 'FREE_DELIVERY_THRESHOLD'
  | 'FEATURED_ITEM'
  | 'COMBO'
  | 'ITEM_PRICE'

type PromotionForm = {
  id?: number
  name: string
  description: string
  code: string
  type: PromotionType
  status: 'ACTIVE' | 'PAUSED'
  startsAt: string
  endsAt: string
  minOrderAmount: string
  discountAmount: string
  discountPercent: string
  maxDiscountAmount: string
  freeDeliveryMinimum: string
  usageLimit: string
  promotionalPrice: string
  priority: string
  itemOfferingIds: number[]
}

const emptyPromotionForm: PromotionForm = {
  name: '',
  description: '',
  code: '',
  type: 'FIXED_AMOUNT',
  status: 'ACTIVE',
  startsAt: '',
  endsAt: '',
  minOrderAmount: '',
  discountAmount: '',
  discountPercent: '',
  maxDiscountAmount: '',
  freeDeliveryMinimum: '',
  usageLimit: '',
  promotionalPrice: '',
  priority: '0',
  itemOfferingIds: [],
}

const promotionTypeLabels: Record<PromotionType, string> = {
  FIXED_AMOUNT: 'Cupom valor fixo',
  PERCENTAGE: 'Cupom percentual',
  FREE_DELIVERY: 'Cupom frete gratis',
  FREE_DELIVERY_THRESHOLD: 'Frete gratis acima de valor',
  FEATURED_ITEM: 'Produto em destaque',
  COMBO: 'Combo promocional',
  ITEM_PRICE: 'Preco promocional por periodo',
}

const parseOptionalNumber = (value: string) =>
  value.trim() ? Number(value.replace(',', '.')) : undefined

const toDatetimeLocal = (value: string | null) =>
  value ? value.slice(0, 16) : ''

const toIsoOrUndefined = (value: string) =>
  value ? new Date(value).toISOString() : undefined

export const DigitalMenuAdmin = () => {
  const {
    selectedStoreId,
    data,
    isLoading,
    isError,
    updatePublication,
    isUpdatingPublication,
    savePromotion,
    isSavingPromotion,
    deletePromotion,
    isDeletingPromotion,
  } = useDigitalMenuAdmin()
  const [publicUrl, setPublicUrl] = useState(data?.publicPath ?? '')
  const [promotionForm, setPromotionForm] =
    useState<PromotionForm>(emptyPromotionForm)

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
  const resetPromotionForm = () => setPromotionForm(emptyPromotionForm)
  const togglePromotionItem = (itemOfferingId: number) => {
    setPromotionForm(current => ({
      ...current,
      itemOfferingIds: current.itemOfferingIds.includes(itemOfferingId)
        ? current.itemOfferingIds.filter(id => id !== itemOfferingId)
        : [...current.itemOfferingIds, itemOfferingId],
    }))
  }
  const submitPromotion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    savePromotion({
      id: promotionForm.id,
      name: promotionForm.name,
      description: promotionForm.description || undefined,
      code: promotionForm.code || undefined,
      type: promotionForm.type,
      status: promotionForm.status,
      startsAt: toIsoOrUndefined(promotionForm.startsAt),
      endsAt: toIsoOrUndefined(promotionForm.endsAt),
      minOrderAmount: parseOptionalNumber(promotionForm.minOrderAmount),
      discountAmount: parseOptionalNumber(promotionForm.discountAmount),
      discountPercent: parseOptionalNumber(promotionForm.discountPercent),
      maxDiscountAmount: parseOptionalNumber(promotionForm.maxDiscountAmount),
      freeDeliveryMinimum: parseOptionalNumber(
        promotionForm.freeDeliveryMinimum
      ),
      usageLimit: parseOptionalNumber(promotionForm.usageLimit),
      promotionalPrice: parseOptionalNumber(promotionForm.promotionalPrice),
      priority: parseOptionalNumber(promotionForm.priority) ?? 0,
      itemOfferingIds: promotionForm.itemOfferingIds,
    })
    resetPromotionForm()
  }

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

      <section aria-labelledby="promotions-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="promotions-title" className="text-lg font-semibold">
              Campanhas e cupons
            </h2>
            <p className="text-sm text-muted-foreground">
              Configure descontos, frete gratis, destaques, combos e promocoes
              com periodo.
            </p>
          </div>
          <Badge className="border-primary/20 bg-primary/10 text-primary">
            {
              data.promotions.filter(promotion => promotion.status === 'ACTIVE')
                .length
            }{' '}
            ativa(s)
          </Badge>
        </div>

        <form
          onSubmit={submitPromotion}
          className="space-y-4 rounded-lg border bg-card p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Gift className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">
                {promotionForm.id ? 'Editar campanha' : 'Nova campanha'}
              </h3>
              <p className="text-xs text-muted-foreground">
                Cupom e promocao sao validados novamente no fechamento do
                pedido.
              </p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.2fr_220px_160px]">
            <label className="space-y-1 text-sm font-medium">
              Nome da campanha
              <Input
                value={promotionForm.name}
                onChange={event =>
                  setPromotionForm(current => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Ex: Primeira compra"
                required
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Tipo
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-primary/20 focus-visible:ring-[3px]"
                value={promotionForm.type}
                onChange={event =>
                  setPromotionForm(current => ({
                    ...current,
                    type: event.target.value as PromotionType,
                  }))
                }
              >
                {Object.entries(promotionTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-end justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm font-medium">
              Ativa
              <Switch
                checked={promotionForm.status === 'ACTIVE'}
                onCheckedChange={checked =>
                  setPromotionForm(current => ({
                    ...current,
                    status: checked ? 'ACTIVE' : 'PAUSED',
                  }))
                }
              />
            </label>
          </div>

          <label className="block space-y-1 text-sm font-medium">
            Descricao interna
            <Textarea
              className="min-h-16"
              value={promotionForm.description}
              onChange={event =>
                setPromotionForm(current => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Ex: campanha de abertura do cardapio digital"
            />
          </label>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {['FIXED_AMOUNT', 'PERCENTAGE', 'FREE_DELIVERY'].includes(
              promotionForm.type
            ) && (
              <label className="space-y-1 text-sm font-medium">
                Codigo do cupom
                <Input
                  value={promotionForm.code}
                  onChange={event =>
                    setPromotionForm(current => ({
                      ...current,
                      code: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="Ex: PRIMEIRA10"
                  required
                />
              </label>
            )}
            {promotionForm.type === 'FIXED_AMOUNT' && (
              <label className="space-y-1 text-sm font-medium">
                Desconto fixo
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={promotionForm.discountAmount}
                  onChange={event =>
                    setPromotionForm(current => ({
                      ...current,
                      discountAmount: event.target.value,
                    }))
                  }
                  required
                />
              </label>
            )}
            {promotionForm.type === 'PERCENTAGE' && (
              <>
                <label className="space-y-1 text-sm font-medium">
                  Percentual
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={promotionForm.discountPercent}
                    onChange={event =>
                      setPromotionForm(current => ({
                        ...current,
                        discountPercent: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label className="space-y-1 text-sm font-medium">
                  Teto do desconto
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={promotionForm.maxDiscountAmount}
                    onChange={event =>
                      setPromotionForm(current => ({
                        ...current,
                        maxDiscountAmount: event.target.value,
                      }))
                    }
                    placeholder="Opcional"
                  />
                </label>
              </>
            )}
            {promotionForm.type === 'FREE_DELIVERY_THRESHOLD' && (
              <label className="space-y-1 text-sm font-medium">
                Frete gratis acima de
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={promotionForm.freeDeliveryMinimum}
                  onChange={event =>
                    setPromotionForm(current => ({
                      ...current,
                      freeDeliveryMinimum: event.target.value,
                    }))
                  }
                  required
                />
              </label>
            )}
            {promotionForm.type === 'ITEM_PRICE' && (
              <label className="space-y-1 text-sm font-medium">
                Preco promocional
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={promotionForm.promotionalPrice}
                  onChange={event =>
                    setPromotionForm(current => ({
                      ...current,
                      promotionalPrice: event.target.value,
                    }))
                  }
                  required
                />
              </label>
            )}
            <label className="space-y-1 text-sm font-medium">
              Pedido minimo
              <Input
                type="number"
                min="0"
                step="0.01"
                value={promotionForm.minOrderAmount}
                onChange={event =>
                  setPromotionForm(current => ({
                    ...current,
                    minOrderAmount: event.target.value,
                  }))
                }
                placeholder="Opcional"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Limite de uso
              <Input
                type="number"
                min="1"
                value={promotionForm.usageLimit}
                onChange={event =>
                  setPromotionForm(current => ({
                    ...current,
                    usageLimit: event.target.value,
                  }))
                }
                placeholder="Opcional"
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Inicio
              <Input
                type="datetime-local"
                value={promotionForm.startsAt}
                onChange={event =>
                  setPromotionForm(current => ({
                    ...current,
                    startsAt: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Fim
              <Input
                type="datetime-local"
                value={promotionForm.endsAt}
                onChange={event =>
                  setPromotionForm(current => ({
                    ...current,
                    endsAt: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              Prioridade
              <Input
                type="number"
                min="0"
                max="999"
                value={promotionForm.priority}
                onChange={event =>
                  setPromotionForm(current => ({
                    ...current,
                    priority: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          {['FEATURED_ITEM', 'COMBO', 'ITEM_PRICE'].includes(
            promotionForm.type
          ) && (
            <div className="space-y-2 rounded-md border bg-background p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <PackageOpen className="size-4 text-primary" />
                Produtos da campanha
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {data.productOptions.map(option => (
                  <label
                    key={option.id}
                    className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={promotionForm.itemOfferingIds.includes(
                        option.id
                      )}
                      onChange={() => togglePromotionItem(option.id)}
                      className="size-4 accent-primary"
                    />
                    <span className="line-clamp-1">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" isLoading={isSavingPromotion}>
              <Save className="size-4" />
              {promotionForm.id ? 'Salvar campanha' : 'Criar campanha'}
            </Button>
            {promotionForm.id && (
              <Button
                type="button"
                variant="outline"
                onClick={resetPromotionForm}
              >
                Cancelar edicao
              </Button>
            )}
          </div>
        </form>

        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Regra</TableHead>
                <TableHead>Uso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.promotions.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Nenhuma campanha criada ainda.
                  </TableCell>
                </TableRow>
              )}
              {data.promotions.map(promotion => (
                <TableRow key={promotion.id}>
                  <TableCell>
                    <div className="font-medium">{promotion.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {promotion.code
                        ? `Cupom ${promotion.code}`
                        : promotion.description || '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    {promotionTypeLabels[promotion.type as PromotionType]}
                  </TableCell>
                  <TableCell>
                    <PromotionRuleSummary promotion={promotion} />
                  </TableCell>
                  <TableCell>
                    {promotion.usedCount}
                    {promotion.usageLimit ? ` / ${promotion.usageLimit}` : ''}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        promotion.status === 'ACTIVE'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-muted bg-muted text-muted-foreground'
                      }
                    >
                      {promotion.status === 'ACTIVE' ? 'Ativa' : 'Pausada'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          setPromotionForm({
                            id: promotion.id,
                            name: promotion.name,
                            description: promotion.description ?? '',
                            code: promotion.code ?? '',
                            type: promotion.type as PromotionType,
                            status: promotion.status as 'ACTIVE' | 'PAUSED',
                            startsAt: toDatetimeLocal(promotion.startsAt),
                            endsAt: toDatetimeLocal(promotion.endsAt),
                            minOrderAmount: promotion.minOrderAmount
                              ? String(Number(promotion.minOrderAmount))
                              : '',
                            discountAmount: promotion.discountAmount
                              ? String(Number(promotion.discountAmount))
                              : '',
                            discountPercent: promotion.discountPercent
                              ? String(promotion.discountPercent)
                              : '',
                            maxDiscountAmount: promotion.maxDiscountAmount
                              ? String(Number(promotion.maxDiscountAmount))
                              : '',
                            freeDeliveryMinimum: promotion.freeDeliveryMinimum
                              ? String(Number(promotion.freeDeliveryMinimum))
                              : '',
                            usageLimit: promotion.usageLimit
                              ? String(promotion.usageLimit)
                              : '',
                            promotionalPrice: promotion.promotionalPrice
                              ? String(Number(promotion.promotionalPrice))
                              : '',
                            priority: String(promotion.priority),
                            itemOfferingIds: promotion.itemOfferingIds,
                          })
                        }
                      >
                        <Edit3 className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={isDeletingPromotion}
                        onClick={() => deletePromotion(promotion.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </main>
  )
}

const PromotionRuleSummary = ({
  promotion,
}: {
  promotion: {
    type: string
    discountAmount: string | null
    discountPercent: number | null
    maxDiscountAmount: string | null
    minOrderAmount: string | null
    freeDeliveryMinimum: string | null
    promotionalPrice: string | null
    itemOfferingIds: number[]
  }
}) => {
  if (promotion.type === 'FIXED_AMOUNT') {
    return (
      <span className="inline-flex items-center gap-1">
        <Gift className="size-3 text-primary" />
        {money(promotion.discountAmount)} de desconto
      </span>
    )
  }

  if (promotion.type === 'PERCENTAGE') {
    return (
      <span className="inline-flex items-center gap-1">
        <Percent className="size-3 text-primary" />
        {promotion.discountPercent}% de desconto
        {promotion.maxDiscountAmount
          ? ` ate ${money(promotion.maxDiscountAmount)}`
          : ''}
      </span>
    )
  }

  if (promotion.type === 'FREE_DELIVERY') return <>Frete gratis via cupom</>

  if (promotion.type === 'FREE_DELIVERY_THRESHOLD') {
    return <>Frete gratis acima de {money(promotion.freeDeliveryMinimum)}</>
  }

  if (promotion.type === 'FEATURED_ITEM') {
    return <>{promotion.itemOfferingIds.length} produto(s) em destaque</>
  }

  if (promotion.type === 'COMBO') {
    return <>{promotion.itemOfferingIds.length} produto(s) no combo</>
  }

  if (promotion.type === 'ITEM_PRICE') {
    return <>Preco promocional {money(promotion.promotionalPrice)}</>
  }

  return <>Regra promocional</>
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
