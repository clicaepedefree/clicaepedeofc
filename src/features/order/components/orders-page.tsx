'use client'

import {
  addOrderAuditNote,
  listOrders,
  transitionOrderStatus,
} from '@/features/order/api'
import { ordersCacheKey } from '@/features/order/cache-keys'
import { selectedStoreIdAtom } from '@/features/store/state'
import { Badge } from '@/shared/badge'
import { PageHeaderBlock } from '@/shared/blocks/page-header-block'
import { Button } from '@/shared/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/dialog'
import { Input } from '@/shared/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/shared/sheet'
import { LoadingSpinner } from '@/shared/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/table'
import { Textarea } from '@/shared/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/shared/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/tooltip'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import {
  Ban,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleX,
  ClipboardList,
  FilePlus2,
  RefreshCw,
  Search,
  StickyNote,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

type OrderAction = 'accept' | 'reject' | 'cancel' | 'complete'
type QueueTab = 'NEW' | 'PREPARING' | 'FINISHED'

type AuditEvent = {
  id?: number | string
  action?: string | null
  eventType?: string | null
  status?: string | null
  fromStatus?: string | null
  toStatus?: string | null
  reason?: string | null
  note?: string | null
  actorName?: string | null
  origin?: string | null
  createdAt?: string | Date | null
}

type OrderItem = {
  id: number | string
  itemName: string
  quantity: number | string
  price: number | string
  comment?: string | null
  options?: Array<{
    id: number | string
    optionName: string
    quantity: number | string
    price?: number | string | null
  }>
}

type Order = {
  id: number
  displayId: string | number
  status: string
  salesChannel: string
  type: string
  totalPrice: number | string
  customerName?: string | null
  createdAt: string | Date
  updatedAt: string | Date
  items?: OrderItem[]
  payments?: Array<{
    id: number | string
    method: string
    type?: string | null
    value: number | string
    cardBrand?: string | null
    changeFor?: number | string | null
  }>
  auditEvents?: AuditEvent[]
}

const statusLabels: Record<string, string> = {
  PENDING: 'Pendente',
  CREATED: 'Criado',
  SENT_TO_STORE: 'Enviado para a loja',
  RECEIVED: 'Recebido',
  ACCEPTED: 'Aceito',
  REJECTED: 'Recusado',
  COMPLETED: 'Concluído',
  CANCELLED: 'Cancelado',
}

const channelLabels: Record<string, string> = {
  POS: 'Caixa / PDV',
  DIGITAL_MENU: 'Cardápio digital',
}

const auditOriginLabels: Record<string, string> = {
  POS: 'Caixa / PDV',
  DIGITAL_MENU: 'Cardápio digital',
  MANUAL: 'Ação manual',
  SYSTEM: 'Sistema',
}

const typeLabels: Record<string, string> = {
  DELIVERY: 'Entrega',
  TAKEOUT: 'Retirada',
  INDOOR: 'Consumo no local',
}

const paymentLabels: Record<string, string> = {
  CASH: 'Dinheiro',
  PIX: 'Pix',
  CREDIT: 'Crédito',
  DEBIT: 'Débito',
  MEAL_VOUCHER: 'Vale-refeição',
  FOOD_VOUCHER: 'Vale-alimentação',
  ONLINE: 'Pagamento online',
}

const actionLabels: Record<OrderAction, string> = {
  accept: 'Aceitar',
  reject: 'Recusar',
  cancel: 'Cancelar',
  complete: 'Concluir',
}

const validActions: Record<string, OrderAction[]> = {
  PENDING: ['accept', 'reject', 'cancel'],
  CREATED: ['accept', 'reject', 'cancel'],
  SENT_TO_STORE: ['accept', 'reject', 'cancel'],
  RECEIVED: ['accept', 'reject', 'cancel'],
  ACCEPTED: ['complete', 'cancel'],
}

const queueStatuses: Record<QueueTab, string[]> = {
  NEW: ['PENDING', 'CREATED', 'SENT_TO_STORE'],
  PREPARING: ['RECEIVED', 'ACCEPTED', 'READY', 'OUT_FOR_DELIVERY'],
  FINISHED: ['COMPLETED', 'CANCELLED', 'REJECTED'],
}

const actionIcons = {
  accept: Check,
  reject: CircleX,
  cancel: Ban,
  complete: CheckCircle2,
}

const selectClassName =
  'h-9 min-w-0 rounded border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-primary/20'

const formatCurrency = (value: number | string) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value))

const formatDateTime = (value?: string | Date | null) =>
  value
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(value))
    : 'Não informado'

const statusLabel = (status?: string | null) =>
  status ? (statusLabels[status] ?? status) : 'Atualização'

const formatWaitingTime = (value: string | Date, now: number) => {
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000))
  if (minutes < 1) return 'Agora'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}min`
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'CANCELLED' || status === 'REJECTED'
      ? 'destructive'
      : status === 'PENDING' || status === 'CREATED' || status === 'SENT_TO_STORE'
        ? 'warning'
        : status === 'COMPLETED'
          ? 'default'
          : 'secondary'

  return <Badge variant={variant}>{statusLabel(status)}</Badge>
}

function IconButton({
  label,
  children,
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} title={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function OrdersPage() {
  const storeId = useAtomValue(selectedStoreIdAtom)
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('ALL')
  const [channel, setChannel] = useState('ALL')
  const [type, setType] = useState('ALL')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [pendingAction, setPendingAction] = useState<OrderAction | null>(null)
  const [reason, setReason] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [queueTab, setQueueTab] = useState<QueueTab>('NEW')
  const [now, setNow] = useState(() => Date.now())

  const ordersQuery = useQuery({
    queryKey: ordersCacheKey(storeId),
    queryFn: () => listOrders(storeId!) as Promise<Order[]>,
    enabled: !!storeId,
    refetchOnMount: 'always',
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  })

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  const invalidateOrders = async () => {
    await queryClient.invalidateQueries({ queryKey: ordersCacheKey(storeId) })
  }

  const transitionMutation = useMutation({
    mutationFn: ({ action, reason }: { action: OrderAction; reason?: string }) =>
      transitionOrderStatus({
        orderId: selectedOrder!.id,
        storeId: storeId!,
        action,
        reason,
      }),
    onSuccess: async (_, variables) => {
      await invalidateOrders()
      toast.success(`Pedido ${actionLabels[variables.action].toLowerCase()} com sucesso.`)
      setPendingAction(null)
      setReason('')
      setSelectedOrder(null)
    },
    onError: error =>
      toast.error('Não foi possível atualizar o pedido.', {
        description: error instanceof Error ? error.message : undefined,
      }),
  })

  const noteMutation = useMutation({
    mutationFn: (note: string) =>
      addOrderAuditNote({
        orderId: selectedOrder!.id,
        storeId: storeId!,
        reason: note,
      }),
    onSuccess: async () => {
      await invalidateOrders()
      toast.success('Nota interna adicionada.')
      setNoteOpen(false)
      setReason('')
    },
    onError: error =>
      toast.error('Não foi possível adicionar a nota.', {
        description: error instanceof Error ? error.message : undefined,
      }),
  })

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return (ordersQuery.data ?? []).filter(order => {
      const matchesSearch =
        !term ||
        String(order.displayId).toLocaleLowerCase('pt-BR').includes(term) ||
        (order.customerName ?? '').toLocaleLowerCase('pt-BR').includes(term)
      return (
        matchesSearch &&
        queueStatuses[queueTab].includes(order.status) &&
        (status === 'ALL' || order.status === status) &&
        (channel === 'ALL' || order.salesChannel === channel) &&
        (type === 'ALL' || order.type === type)
      )
    })
  }, [ordersQuery.data, search, status, channel, type, queueTab])

  const queueCounts = useMemo(() => {
    const orders = ordersQuery.data ?? []
    return Object.fromEntries(
      Object.entries(queueStatuses).map(([key, statuses]) => [
        key,
        orders.filter(order => statuses.includes(order.status)).length,
      ])
    ) as Record<QueueTab, number>
  }, [ordersQuery.data])

  useEffect(() => {
    if (!selectedOrder) return
    const refreshedOrder = ordersQuery.data?.find(order => order.id === selectedOrder.id)
    if (refreshedOrder && refreshedOrder !== selectedOrder) setSelectedOrder(refreshedOrder)
  }, [ordersQuery.data, selectedOrder])

  const hasFilters = search || status !== 'ALL' || channel !== 'ALL' || type !== 'ALL'
  const resetFilters = () => {
    setSearch('')
    setStatus('ALL')
    setChannel('ALL')
    setType('ALL')
  }

  const requestAction = (action: OrderAction) => {
    if (action === 'reject' || action === 'cancel') {
      setReason('')
      setPendingAction(action)
      return
    }
    transitionMutation.mutate({ action })
  }

  return (
    <div className="min-h-full">
      <PageHeaderBlock
        title="Pedidos"
        subtitle="Acompanhe e gerencie os pedidos da loja selecionada"
      />

      <section aria-label="Filtros de pedidos" className="border-b bg-background px-4 py-3 lg:px-6">
        <Tabs value={queueTab} onValueChange={value => setQueueTab(value as QueueTab)} className="mb-3">
          <TabsList className="grid h-10 w-full grid-cols-3 sm:w-auto">
            <TabsTrigger value="NEW">Novos <Badge variant="secondary">{queueCounts.NEW}</Badge></TabsTrigger>
            <TabsTrigger value="PREPARING">Em preparo <Badge variant="secondary">{queueCounts.PREPARING}</Badge></TabsTrigger>
            <TabsTrigger value="FINISHED">Finalizados <Badge variant="secondary">{queueCounts.FINISHED}</Badge></TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1 xl:max-w-md">
            <span className="sr-only">Buscar por número ou cliente</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por número ou cliente"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex">
            <select aria-label="Filtrar por status" className={selectClassName} value={status} onChange={event => setStatus(event.target.value)}>
              <option value="ALL">Todos os status</option>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select aria-label="Filtrar por canal" className={selectClassName} value={channel} onChange={event => setChannel(event.target.value)}>
              <option value="ALL">Todos os canais</option>
              {Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select aria-label="Filtrar por tipo" className={selectClassName} value={type} onChange={event => setType(event.target.value)}>
              <option value="ALL">Todos os tipos</option>
              {Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <X className="size-4" /> Limpar
              </Button>
            )}
          </div>
        </div>
      </section>

      <main className="p-4 lg:p-6">
        <p className="sr-only" aria-live="polite">
          {ordersQuery.isFetching ? 'Atualizando pedidos.' : `${filteredOrders.length} pedidos exibidos na fila.`}
        </p>
        {!storeId || ordersQuery.isPending ? (
          <StatePanel icon={<LoadingSpinner />} title="Carregando pedidos" description="Buscando os pedidos da loja selecionada." />
        ) : ordersQuery.isError ? (
          <StatePanel
            icon={<CircleX className="size-6" />}
            title="Não foi possível carregar os pedidos"
            description={ordersQuery.error instanceof Error ? ordersQuery.error.message : 'Tente novamente em instantes.'}
            action={<Button variant="outline" onClick={() => ordersQuery.refetch()}><RefreshCw className="size-4" /> Tentar novamente</Button>}
          />
        ) : !ordersQuery.data?.length ? (
          <StatePanel icon={<ClipboardList className="size-6" />} title="Nenhum pedido ainda" description="Os novos pedidos desta loja aparecerão aqui." />
        ) : !filteredOrders.length ? (
          <StatePanel
            icon={<Search className="size-6" />}
            title="Nenhum resultado"
            description="Altere a busca ou os filtros para encontrar outros pedidos."
            action={<Button variant="outline" onClick={resetFilters}><X className="size-4" /> Limpar filtros</Button>}
          />
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-md border bg-card md:block">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead>Pedido</TableHead><TableHead>Aguardando</TableHead><TableHead>Cliente</TableHead><TableHead>Canal / tipo</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead>Atualização</TableHead><TableHead className="w-12"><span className="sr-only">Detalhes</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map(order => (
                    <TableRow key={order.id}>
                      <TableCell className="font-semibold">#{order.displayId}</TableCell>
                      <TableCell><span className="font-medium tabular-nums">{formatWaitingTime(order.createdAt, now)}</span><span className="block text-xs text-muted-foreground">desde {formatDateTime(order.createdAt)}</span></TableCell>
                      <TableCell className="max-w-52 truncate">{order.customerName || 'Cliente não informado'}</TableCell>
                      <TableCell><div className="font-medium">{channelLabels[order.salesChannel] ?? order.salesChannel}</div><div className="text-xs text-muted-foreground">{typeLabels[order.type] ?? order.type}</div></TableCell>
                      <TableCell className="font-semibold tabular-nums">{formatCurrency(order.totalPrice)}</TableCell>
                      <TableCell><StatusBadge status={order.status} /></TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(order.updatedAt)}</TableCell>
                      <TableCell><IconButton label={`Ver detalhes do pedido ${order.displayId}`} variant="ghost" size="icon" onClick={() => setSelectedOrder(order)}><ChevronRight className="size-4" aria-hidden="true" /></IconButton></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="divide-y overflow-hidden rounded-md border bg-card md:hidden">
              {filteredOrders.map(order => (
                <button key={order.id} className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/20" onClick={() => setSelectedOrder(order)}>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2"><span className="font-semibold">#{order.displayId}</span><StatusBadge status={order.status} /></div>
                    <p className="truncate text-sm">{order.customerName || 'Cliente não informado'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Aguardando {formatWaitingTime(order.createdAt, now)} · {channelLabels[order.salesChannel] ?? order.salesChannel} · {typeLabels[order.type] ?? order.type}</p>
                  </div>
                  <div className="shrink-0 text-right"><p className="text-sm font-semibold tabular-nums">{formatCurrency(order.totalPrice)}</p><ChevronRight className="ml-auto mt-2 size-4 text-muted-foreground" /></div>
                </button>
              ))}
            </div>
          </>
        )}
      </main>

      <OrderDetails
        order={selectedOrder}
        open={!!selectedOrder}
        busy={transitionMutation.isPending || noteMutation.isPending}
        onOpenChange={open => !open && setSelectedOrder(null)}
        onAction={requestAction}
        onAddNote={() => { setReason(''); setNoteOpen(true) }}
      />

      <ReasonDialog
        open={!!pendingAction}
        title={pendingAction ? `${actionLabels[pendingAction]} pedido #${selectedOrder?.displayId}` : ''}
        description="Informe o motivo. Ele ficará registrado na linha do tempo do pedido."
        value={reason}
        confirmLabel={pendingAction ? actionLabels[pendingAction] : 'Confirmar'}
        busy={transitionMutation.isPending}
        destructive
        onChange={setReason}
        onOpenChange={open => { if (!open) { setPendingAction(null); setReason('') } }}
        onConfirm={() => pendingAction && reason.trim() && transitionMutation.mutate({ action: pendingAction, reason: reason.trim() })}
      />

      <ReasonDialog
        open={noteOpen}
        title={`Adicionar nota ao pedido #${selectedOrder?.displayId ?? ''}`}
        description="A nota é interna e ficará registrada no histórico deste pedido."
        value={reason}
        confirmLabel="Adicionar nota"
        busy={noteMutation.isPending}
        onChange={setReason}
        onOpenChange={open => { setNoteOpen(open); if (!open) setReason('') }}
        onConfirm={() => reason.trim() && noteMutation.mutate(reason.trim())}
      />
    </div>
  )
}

function StatePanel({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-md border border-dashed bg-background p-8 text-center"><div className="text-muted-foreground">{icon}</div><div><h2 className="font-semibold">{title}</h2><p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p></div>{action}</div>
}

function OrderDetails({ order, open, busy, onOpenChange, onAction, onAddNote }: { order: Order | null; open: boolean; busy: boolean; onOpenChange: (open: boolean) => void; onAction: (action: OrderAction) => void; onAddNote: () => void }) {
  if (!order) return null
  const events = [...(order.auditEvents ?? [])].sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime())
  const actions = validActions[order.status] ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-2xl">
        <SheetHeader className="border-b pr-12">
          <div className="flex flex-wrap items-center gap-2"><SheetTitle className="text-lg">Pedido #{order.displayId}</SheetTitle><StatusBadge status={order.status} /></div>
          <SheetDescription>{order.customerName || 'Cliente não informado'} · {formatDateTime(order.createdAt)}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          <DetailSection title="Resumo">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              <DetailTerm label="Canal" value={channelLabels[order.salesChannel] ?? order.salesChannel} />
              <DetailTerm label="Tipo" value={typeLabels[order.type] ?? order.type} />
              <DetailTerm label="Total" value={formatCurrency(order.totalPrice)} />
              <DetailTerm label="Atualizado" value={formatDateTime(order.updatedAt)} />
            </dl>
          </DetailSection>
          <DetailSection title={`Itens (${order.items?.length ?? 0})`}>
            <div className="divide-y">
              {(order.items ?? []).map(item => <div key={item.id} className="py-3 first:pt-0 last:pb-0"><div className="flex justify-between gap-4 text-sm"><span className="font-medium">{Number(item.quantity)}x {item.itemName}</span><span className="shrink-0 tabular-nums">{formatCurrency(Number(item.price) * Number(item.quantity))}</span></div>{item.options?.map(option => <p key={option.id} className="mt-1 pl-5 text-xs text-muted-foreground">{Number(option.quantity)}x {option.optionName}{option.price ? ` · ${formatCurrency(option.price)}` : ''}</p>)}{item.comment && <p className="mt-1 pl-5 text-xs italic text-muted-foreground">Observação: {item.comment}</p>}</div>)}
              {!order.items?.length && <p className="text-sm text-muted-foreground">Nenhum item informado.</p>}
            </div>
          </DetailSection>
          <DetailSection title="Pagamentos">
            <div className="space-y-2">{(order.payments ?? []).map(payment => <div key={payment.id} className="flex items-center justify-between text-sm"><span>{paymentLabels[payment.method] ?? payment.method}{payment.cardBrand ? ` · ${payment.cardBrand}` : ''}</span><span className="font-medium tabular-nums">{formatCurrency(payment.value)}</span></div>)}{!order.payments?.length && <p className="text-sm text-muted-foreground">Nenhum pagamento informado.</p>}</div>
          </DetailSection>
          <DetailSection title="Linha do tempo">
            <ol className="relative ml-2 border-l pl-5">{events.map((event, index) => <li key={event.id ?? `${event.createdAt}-${index}`} className="relative pb-5 last:pb-0"><span className="absolute -left-[1.56rem] top-1 size-2.5 rounded-full border-2 border-background bg-primary" /><p className="text-sm font-medium">{auditEventTitle(event)}</p>{(event.reason || event.note) && <p className="mt-1 text-sm text-muted-foreground">{event.reason || event.note}</p>}<p className="mt-1 text-xs text-muted-foreground">{formatDateTime(event.createdAt)}{event.actorName ? ` · ${event.actorName}` : ''}{event.origin ? ` · ${auditOriginLabels[event.origin] ?? event.origin}` : ''}</p></li>)}{!events.length && <li className="text-sm text-muted-foreground">Nenhum evento registrado.</li>}</ol>
          </DetailSection>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-background p-4">
          <IconButton label="Adicionar nota interna" variant="outline" size="icon" disabled={busy} onClick={onAddNote}><StickyNote className="size-4" /></IconButton>
          <div className="flex flex-wrap justify-end gap-2">{actions.map(action => { const Icon = actionIcons[action]; return <Button key={action} variant={action === 'reject' || action === 'cancel' ? 'destructive' : action === 'complete' ? 'default' : 'secondary'} size="sm" disabled={busy} onClick={() => onAction(action)} title={actionLabels[action]}><Icon className="size-4" />{actionLabels[action]}</Button> })}</div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-b p-4 sm:p-6"><h3 className="mb-4 text-sm font-semibold">{title}</h3>{children}</section>
}

function DetailTerm({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>
}

function auditEventTitle(event: AuditEvent) {
  if (event.eventType === 'order_created') return 'Pedido criado'
  if (event.eventType === 'historical_snapshot') return 'Estado histórico importado'
  if (event.eventType === 'note_added') return 'Nota interna adicionada'
  if (event.eventType === 'status_changed' && event.toStatus) {
    return event.fromStatus
      ? `${statusLabel(event.fromStatus)} → ${statusLabel(event.toStatus)}`
      : `Status alterado para ${statusLabel(event.toStatus)}`
  }
  if (event.fromStatus || event.toStatus) return `${statusLabel(event.fromStatus)} → ${statusLabel(event.toStatus)}`
  if (event.status) return statusLabel(event.status)
  if (event.action) return statusLabels[event.action] ?? event.action
  return event.eventType ?? 'Atualização do pedido'
}

function ReasonDialog({ open, title, description, value, confirmLabel, busy, destructive = false, onChange, onOpenChange, onConfirm }: { open: boolean; title: string; description: string; value: string; confirmLabel: string; busy: boolean; destructive?: boolean; onChange: (value: string) => void; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  const error = open && value.length > 0 && !value.trim() ? 'Informe um motivo válido.' : undefined
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><div><label htmlFor="order-reason" className="mb-2 block text-sm font-medium">Motivo <span aria-hidden="true">*</span></label><Textarea id="order-reason" autoFocus rows={4} maxLength={500} value={value} error={error} onChange={event => onChange(event.target.value)} placeholder="Descreva o motivo sem dados pessoais" /><p className="mt-1 text-xs text-muted-foreground">Não inclua telefone, CPF, CNPJ, e-mail ou endereço.</p><p className="mt-1 text-right text-xs text-muted-foreground">{value.length}/500</p></div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Voltar</Button><Button variant={destructive ? 'destructive' : 'default'} disabled={!value.trim()} isLoading={busy} onClick={onConfirm}>{destructive ? <Ban className="size-4" /> : <FilePlus2 className="size-4" />}{confirmLabel}</Button></DialogFooter></DialogContent></Dialog>
}
