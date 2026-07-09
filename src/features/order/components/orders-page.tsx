'use client'

import {
  addOrderAuditNote,
  createOrderPublicTrackingLink,
  generateOrderReceipt,
  listOrders,
  transitionOrderStatus,
} from '@/features/order/api'
import { ordersCacheKey } from '@/features/order/cache-keys'
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  showNewOrderBrowserNotification,
  type BrowserNotificationPermission,
} from '@/features/order/notifications'
import { useOrderReceipt } from '@/features/receipt/hooks/use-order-receipt'
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
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleX,
  ClipboardList,
  Clock3,
  Copy,
  FilePlus2,
  PackageCheck,
  Printer,
  RefreshCw,
  Search,
  StickyNote,
  Truck,
  Utensils,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

type OrderAction =
  | 'accept'
  | 'start_preparation'
  | 'mark_ready'
  | 'dispatch'
  | 'reject'
  | 'cancel'
  | 'complete'

type QueueTab =
  | 'NEW'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'OUT_FOR_DELIVERY'
  | 'FINISHED'
  | 'CANCELLED'

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
  customerPhone?: string | null
  orderNotes?: string | null
  deliveryAddress?: string | null
  deliveryAddressReference?: string | null
  deliveryAddressComplement?: string | null
  deliveryNeighborhood?: string | null
  deliveryFee?: number | string | null
  deliveryEstimatedMinutes?: number | null
  deliveryEta?: string | Date | null
  hasPublicTracking?: boolean
  publicTrackingExpiresAt?: string | Date | null
  rejectionReason?: string | null
  lastPrintedAt?: string | Date | null
  printCount?: number | null
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
  IN_PREPARATION: 'Em preparo',
  READY: 'Pronto',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  REJECTED: 'Recusado',
  COMPLETED: 'Finalizado',
  CANCELLED: 'Cancelado',
}

const channelLabels: Record<string, string> = {
  POS: 'Caixa / PDV',
  DIGITAL_MENU: 'Cardapio digital',
}

const auditOriginLabels: Record<string, string> = {
  POS: 'Caixa / PDV',
  DIGITAL_MENU: 'Cardapio digital',
  MANUAL: 'Acao manual',
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
  CREDIT: 'Credito',
  DEBIT: 'Debito',
  MEAL_VOUCHER: 'Vale-refeicao',
  FOOD_VOUCHER: 'Vale-alimentacao',
  ONLINE: 'Pagamento online',
}

const actionLabels: Record<OrderAction, string> = {
  accept: 'Aceitar',
  start_preparation: 'Iniciar preparo',
  mark_ready: 'Marcar pronto',
  dispatch: 'Saiu para entrega',
  reject: 'Recusar',
  cancel: 'Cancelar',
  complete: 'Finalizar',
}

const validActions: Record<string, OrderAction[]> = {
  PENDING: ['accept', 'reject', 'cancel'],
  CREATED: ['accept', 'reject', 'cancel'],
  SENT_TO_STORE: ['accept', 'reject', 'cancel'],
  RECEIVED: ['accept', 'reject', 'cancel'],
  ACCEPTED: ['start_preparation', 'mark_ready', 'dispatch', 'complete', 'cancel'],
  IN_PREPARATION: ['mark_ready', 'dispatch', 'complete', 'cancel'],
  READY: ['dispatch', 'complete', 'cancel'],
  OUT_FOR_DELIVERY: ['complete', 'cancel'],
}

const queueStatuses: Record<QueueTab, string[]> = {
  NEW: ['PENDING', 'CREATED', 'SENT_TO_STORE', 'RECEIVED'],
  ACCEPTED: ['ACCEPTED'],
  PREPARING: ['IN_PREPARATION', 'READY'],
  OUT_FOR_DELIVERY: ['OUT_FOR_DELIVERY'],
  FINISHED: ['COMPLETED'],
  CANCELLED: ['CANCELLED', 'REJECTED'],
}

const queueLabels: Record<QueueTab, string> = {
  NEW: 'Novos',
  ACCEPTED: 'Aceitos',
  PREPARING: 'Em preparo',
  OUT_FOR_DELIVERY: 'Saiu para entrega',
  FINISHED: 'Finalizados',
  CANCELLED: 'Recusados/cancelados',
}

const actionIcons = {
  accept: Check,
  start_preparation: Utensils,
  mark_ready: PackageCheck,
  dispatch: Truck,
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
    : 'Nao informado'

const statusLabel = (status?: string | null) =>
  status ? (statusLabels[status] ?? status) : 'Atualizacao'

const formatWaitingTime = (value: string | Date, now: number) => {
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60_000))
  if (minutes < 1) return 'Agora'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}min`
}

const getStoredBoolean = (key: string, fallback: boolean) => {
  if (typeof window === 'undefined') return fallback
  const value = window.localStorage.getItem(key)
  if (value === null) return fallback
  return value === 'true'
}

const playNewOrderSound = () => {
  const BrowserAudioContext: typeof window.AudioContext | undefined =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext
  if (!BrowserAudioContext) return

  const context = new BrowserAudioContext()
  const oscillator = context.createOscillator()
  const gain = context.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(880, context.currentTime)
  oscillator.frequency.setValueAtTime(660, context.currentTime + 0.12)
  gain.gain.setValueAtTime(0.001, context.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start()
  oscillator.stop(context.currentTime + 0.38)
}

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === 'CANCELLED' || status === 'REJECTED'
      ? 'destructive'
      : ['PENDING', 'CREATED', 'SENT_TO_STORE', 'RECEIVED'].includes(status)
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
  const [channel, setChannel] = useState('DIGITAL_MENU')
  const [type, setType] = useState('ALL')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [pendingAction, setPendingAction] = useState<OrderAction | null>(null)
  const [reason, setReason] = useState('')
  const [estimatedMinutes, setEstimatedMinutes] = useState('30')
  const [noteOpen, setNoteOpen] = useState(false)
  const [queueTab, setQueueTab] = useState<QueueTab>('NEW')
  const [now, setNow] = useState(() => Date.now())
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(false)
  const [browserNotificationPermission, setBrowserNotificationPermission] =
    useState<BrowserNotificationPermission>('unsupported')
  const knownNewOrderIdsRef = useRef<Set<number> | null>(null)

  const {
    ReceiptContent,
    printOrderReceipt,
    isPrinting,
    printError,
    showPrintErrorToast,
  } = useOrderReceipt()

  useEffect(() => {
    setSoundEnabled(getStoredBoolean('digital-orders-sound-enabled', true))
    setAutoPrintEnabled(getStoredBoolean('digital-orders-auto-print', false))
    setBrowserNotificationPermission(getBrowserNotificationPermission())
  }, [])

  useEffect(() => {
    window.localStorage.setItem('digital-orders-sound-enabled', String(soundEnabled))
  }, [soundEnabled])

  useEffect(() => {
    window.localStorage.setItem('digital-orders-auto-print', String(autoPrintEnabled))
  }, [autoPrintEnabled])

  const ordersQuery = useQuery({
    queryKey: ordersCacheKey(storeId),
    queryFn: () => listOrders(storeId!) as Promise<Order[]>,
    enabled: !!storeId,
    refetchOnMount: 'always',
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  })

  const invalidateOrders = async () => {
    await queryClient.invalidateQueries({ queryKey: ordersCacheKey(storeId) })
  }

  const printMutation = useMutation({
    mutationFn: (order: Order) => generateOrderReceipt(order.id),
    onSuccess: async (result, order) => {
      printOrderReceipt(result.receipt, result.displayId)
      await invalidateOrders()
      toast.success(`Impressao preparada para o pedido #${order.displayId}.`)
    },
    onError: error =>
      toast.error('Nao foi possivel gerar a impressao.', {
        description: error instanceof Error ? error.message : undefined,
      }),
  })

  const transitionMutation = useMutation({
    mutationFn: ({
      action,
      reason,
      estimatedMinutes,
    }: {
      action: OrderAction
      reason?: string
      estimatedMinutes?: number
    }) =>
      transitionOrderStatus({
        orderId: selectedOrder!.id,
        storeId: storeId!,
        action,
        reason,
        estimatedMinutes,
      }),
    onSuccess: async (_, variables) => {
      await invalidateOrders()
      toast.success(`Pedido ${actionLabels[variables.action].toLowerCase()} com sucesso.`)
      setPendingAction(null)
      setReason('')
      setEstimatedMinutes('30')
      setSelectedOrder(null)
    },
    onError: error =>
      toast.error('Nao foi possivel atualizar o pedido.', {
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
      toast.error('Nao foi possivel adicionar a nota.', {
        description: error instanceof Error ? error.message : undefined,
      }),
  })

  const trackingLinkMutation = useMutation({
    mutationFn: (order: Order) =>
      createOrderPublicTrackingLink({
        orderId: order.id,
        storeId: storeId!,
      }),
    onSuccess: async (result, order) => {
      const url = `${window.location.origin}/pedido/${result.token}`
      try {
        await navigator.clipboard.writeText(url)
        toast.success(`Link publico do pedido #${order.displayId} copiado.`, {
          description: `Valido ate ${formatDateTime(result.expiresAt)}.`,
        })
      } catch {
        toast.success(`Link publico gerado para o pedido #${order.displayId}.`, {
          description: url,
        })
      }
      await invalidateOrders()
    },
    onError: error =>
      toast.error('Nao foi possivel gerar o link publico.', {
        description: error instanceof Error ? error.message : undefined,
      }),
  })

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!printError) return
    showPrintErrorToast()
  }, [printError, showPrintErrorToast])

  useEffect(() => {
    const orders = ordersQuery.data
    if (!orders) return
    const openDigitalOrders = orders.filter(
      order => order.salesChannel === 'DIGITAL_MENU' && queueStatuses.NEW.includes(order.status)
    )
    const currentIds = new Set(openDigitalOrders.map(order => order.id))

    if (!knownNewOrderIdsRef.current) {
      knownNewOrderIdsRef.current = currentIds
      return
    }

    const newOrders = openDigitalOrders.filter(order => !knownNewOrderIdsRef.current!.has(order.id))
    knownNewOrderIdsRef.current = currentIds

    if (!newOrders.length) return
    for (const order of newOrders) {
      toast.info(`Novo pedido digital #${order.displayId}`, {
        description: order.customerName ?? 'Cliente sem nome informado',
        duration: 12_000,
      })
      showNewOrderBrowserNotification(order)
    }
    if (soundEnabled) playNewOrderSound()
    if (autoPrintEnabled) {
      for (const order of newOrders) printMutation.mutate(order)
    }
  }, [autoPrintEnabled, ordersQuery.data, printMutation, soundEnabled])

  const enableBrowserNotifications = async () => {
    const permission = await requestBrowserNotificationPermission()
    setBrowserNotificationPermission(permission)
    if (permission === 'granted') {
      toast.success('Notificacoes do navegador ativadas para novos pedidos.')
      return
    }
    if (permission === 'denied') {
      toast.warning('Notificacoes bloqueadas no navegador.', {
        description:
          'Libere a permissao nas configuracoes do site para receber alertas fora da aba.',
      })
      return
    }
    toast.info('Seu navegador nao permitiu ativar notificacoes agora.')
  }

  useEffect(() => {
    if (!selectedOrder) return
    const refreshedOrder = ordersQuery.data?.find(order => order.id === selectedOrder.id)
    if (refreshedOrder && refreshedOrder !== selectedOrder) setSelectedOrder(refreshedOrder)
  }, [ordersQuery.data, selectedOrder])

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    return (ordersQuery.data ?? []).filter(order => {
      const matchesSearch =
        !term ||
        String(order.displayId).toLocaleLowerCase('pt-BR').includes(term) ||
        (order.customerName ?? '').toLocaleLowerCase('pt-BR').includes(term) ||
        (order.customerPhone ?? '').toLocaleLowerCase('pt-BR').includes(term)
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
        orders.filter(order => order.salesChannel === 'DIGITAL_MENU' && statuses.includes(order.status)).length,
      ])
    ) as Record<QueueTab, number>
  }, [ordersQuery.data])

  const newOrderCount = queueCounts.NEW
  const hasFilters = search || status !== 'ALL' || channel !== 'DIGITAL_MENU' || type !== 'ALL'
  const resetFilters = () => {
    setSearch('')
    setStatus('ALL')
    setChannel('DIGITAL_MENU')
    setType('ALL')
  }

  const requestAction = (action: OrderAction) => {
    if (action === 'accept') {
      setEstimatedMinutes(String(selectedOrder?.deliveryEstimatedMinutes ?? 30))
      setPendingAction(action)
      return
    }
    if (action === 'reject' || action === 'cancel') {
      setReason('')
      setPendingAction(action)
      return
    }
    transitionMutation.mutate({ action })
  }

  const confirmPendingAction = () => {
    if (!pendingAction) return
    if (pendingAction === 'accept') {
      transitionMutation.mutate({
        action: pendingAction,
        estimatedMinutes: Number(estimatedMinutes),
      })
      return
    }
    if (reason.trim()) {
      transitionMutation.mutate({ action: pendingAction, reason: reason.trim() })
    }
  }

  return (
    <div className="min-h-full">
      {ReceiptContent}
      <PageHeaderBlock
        title="Pedidos digitais"
        subtitle="Aceite, recuse, acompanhe e imprima os pedidos recebidos pelo cardapio digital"
      />

      <section aria-label="Operacao de pedidos digitais" className="border-b bg-background px-4 py-3 lg:px-6">
        <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
          <div
            className={`rounded-md border px-4 py-3 ${
              newOrderCount > 0
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'bg-muted/40 text-muted-foreground'
            }`}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <Bell className="size-4" />
              {newOrderCount > 0
                ? `${newOrderCount} pedido(s) digital(is) aguardando acao`
                : 'Nenhum pedido digital novo aguardando acao'}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={soundEnabled ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setSoundEnabled(value => !value)}
            >
              {soundEnabled ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              Som
            </Button>
            <Button
              type="button"
              variant={autoPrintEnabled ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setAutoPrintEnabled(value => !value)}
            >
              <Printer className="size-4" />
              Impressao automatica
            </Button>
            {browserNotificationPermission !== 'granted' && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={browserNotificationPermission === 'unsupported'}
                onClick={enableBrowserNotifications}
              >
                <Bell className="size-4" />
                Notificar navegador
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ordersQuery.isFetching}
              onClick={() => ordersQuery.refetch()}
            >
              <RefreshCw className="size-4" />
              Atualizar
            </Button>
          </div>
        </div>

        <Tabs value={queueTab} onValueChange={value => setQueueTab(value as QueueTab)} className="mb-3">
          <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/60 p-1">
            {(Object.keys(queueStatuses) as QueueTab[]).map(tab => (
              <TabsTrigger key={tab} value={tab} className="gap-2">
                {queueLabels[tab]}
                <Badge variant="secondary">{queueCounts[tab]}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1 xl:max-w-md">
            <span className="sr-only">Buscar por numero, cliente ou telefone</span>
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por numero, cliente ou telefone"
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
              <option value="DIGITAL_MENU">Cardapio digital</option>
              <option value="ALL">Todos os canais</option>
              <option value="POS">Caixa / PDV</option>
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
            title="Nao foi possivel carregar os pedidos"
            description={ordersQuery.error instanceof Error ? ordersQuery.error.message : 'Tente novamente em instantes.'}
            action={<Button variant="outline" onClick={() => ordersQuery.refetch()}><RefreshCw className="size-4" /> Tentar novamente</Button>}
          />
        ) : !ordersQuery.data?.length ? (
          <StatePanel icon={<ClipboardList className="size-6" />} title="Nenhum pedido ainda" description="Os novos pedidos desta loja aparecerao aqui." />
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
                    <TableHead>Pedido</TableHead>
                    <TableHead>Aguardando</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Canal / tipo</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Previsao</TableHead>
                    <TableHead className="w-12"><span className="sr-only">Detalhes</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map(order => (
                    <TableRow key={order.id} className={queueStatuses.NEW.includes(order.status) ? 'bg-primary/5' : undefined}>
                      <TableCell className="font-semibold">#{order.displayId}</TableCell>
                      <TableCell><span className="font-medium tabular-nums">{formatWaitingTime(order.createdAt, now)}</span><span className="block text-xs text-muted-foreground">desde {formatDateTime(order.createdAt)}</span></TableCell>
                      <TableCell className="max-w-52 truncate"><span>{order.customerName || 'Cliente nao informado'}</span>{order.customerPhone && <span className="block text-xs text-muted-foreground">{order.customerPhone}</span>}</TableCell>
                      <TableCell><div className="font-medium">{channelLabels[order.salesChannel] ?? order.salesChannel}</div><div className="text-xs text-muted-foreground">{typeLabels[order.type] ?? order.type}</div></TableCell>
                      <TableCell className="font-semibold tabular-nums">{formatCurrency(order.totalPrice)}</TableCell>
                      <TableCell><StatusBadge status={order.status} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{order.deliveryEstimatedMinutes ? `${order.deliveryEstimatedMinutes} min` : '-'}</TableCell>
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
                    <p className="truncate text-sm">{order.customerName || 'Cliente nao informado'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Aguardando {formatWaitingTime(order.createdAt, now)} - {typeLabels[order.type] ?? order.type}</p>
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
        busy={transitionMutation.isPending || noteMutation.isPending || printMutation.isPending || trackingLinkMutation.isPending || isPrinting}
        onOpenChange={open => !open && setSelectedOrder(null)}
        onAction={requestAction}
        onAddNote={() => { setReason(''); setNoteOpen(true) }}
        onPrint={order => printMutation.mutate(order)}
        onCopyTrackingLink={order => trackingLinkMutation.mutate(order)}
      />

      <ActionDialog
        action={pendingAction}
        order={selectedOrder}
        reason={reason}
        estimatedMinutes={estimatedMinutes}
        busy={transitionMutation.isPending}
        onReasonChange={setReason}
        onEstimatedMinutesChange={setEstimatedMinutes}
        onOpenChange={open => {
          if (!open) {
            setPendingAction(null)
            setReason('')
            setEstimatedMinutes('30')
          }
        }}
        onConfirm={confirmPendingAction}
      />

      <ReasonDialog
        open={noteOpen}
        title={`Adicionar nota ao pedido #${selectedOrder?.displayId ?? ''}`}
        description="A nota e interna e ficara registrada no historico deste pedido."
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

function OrderDetails({ order, open, busy, onOpenChange, onAction, onAddNote, onPrint, onCopyTrackingLink }: { order: Order | null; open: boolean; busy: boolean; onOpenChange: (open: boolean) => void; onAction: (action: OrderAction) => void; onAddNote: () => void; onPrint: (order: Order) => void; onCopyTrackingLink: (order: Order) => void }) {
  if (!order) return null
  const events = [...(order.auditEvents ?? [])].sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime())
  const actions = (validActions[order.status] ?? []).filter(action => !(action === 'dispatch' && order.type !== 'DELIVERY'))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 sm:max-w-2xl">
        <SheetHeader className="border-b pr-12">
          <div className="flex flex-wrap items-center gap-2"><SheetTitle className="text-lg">Pedido #{order.displayId}</SheetTitle><StatusBadge status={order.status} /></div>
          <SheetDescription>{order.customerName || 'Cliente nao informado'} - {formatDateTime(order.createdAt)}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          <DetailSection title="Resumo">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              <DetailTerm label="Canal" value={channelLabels[order.salesChannel] ?? order.salesChannel} />
              <DetailTerm label="Tipo" value={typeLabels[order.type] ?? order.type} />
              <DetailTerm label="Total" value={formatCurrency(order.totalPrice)} />
              <DetailTerm label="Atualizado" value={formatDateTime(order.updatedAt)} />
              <DetailTerm label="Previsao" value={order.deliveryEstimatedMinutes ? `${order.deliveryEstimatedMinutes} min` : 'Nao informada'} />
              <DetailTerm label="Link publico" value={order.hasPublicTracking ? `Ativo ate ${formatDateTime(order.publicTrackingExpiresAt)}` : 'Gerar ao copiar'} />
              <DetailTerm label="Impressoes" value={String(order.printCount ?? 0)} />
              <DetailTerm label="Ultima impressao" value={formatDateTime(order.lastPrintedAt)} />
              <DetailTerm label="Telefone" value={order.customerPhone || 'Nao informado'} />
            </dl>
            {(order.deliveryAddress || order.orderNotes || order.rejectionReason) && (
              <div className="mt-4 space-y-2 text-sm">
                {order.deliveryAddress && <p><span className="font-medium">Endereco:</span> {order.deliveryAddress}{order.deliveryNeighborhood ? ` - ${order.deliveryNeighborhood}` : ''}</p>}
                {order.deliveryAddressComplement && <p><span className="font-medium">Complemento:</span> {order.deliveryAddressComplement}</p>}
                {order.deliveryAddressReference && <p><span className="font-medium">Referencia:</span> {order.deliveryAddressReference}</p>}
                {order.orderNotes && <p><span className="font-medium">Observacao do cliente:</span> {order.orderNotes}</p>}
                {order.rejectionReason && <p><span className="font-medium">Motivo registrado:</span> {order.rejectionReason}</p>}
              </div>
            )}
          </DetailSection>
          <DetailSection title={`Itens (${order.items?.length ?? 0})`}>
            <div className="divide-y">
              {(order.items ?? []).map(item => <div key={item.id} className="py-3 first:pt-0 last:pb-0"><div className="flex justify-between gap-4 text-sm"><span className="font-medium">{Number(item.quantity)}x {item.itemName}</span><span className="shrink-0 tabular-nums">{formatCurrency(Number(item.price) * Number(item.quantity))}</span></div>{item.options?.map(option => <p key={option.id} className="mt-1 pl-5 text-xs text-muted-foreground">{Number(option.quantity)}x {option.optionName}{option.price ? ` - ${formatCurrency(option.price)}` : ''}</p>)}{item.comment && <p className="mt-1 pl-5 text-xs italic text-muted-foreground">Observacao: {item.comment}</p>}</div>)}
              {!order.items?.length && <p className="text-sm text-muted-foreground">Nenhum item informado.</p>}
            </div>
          </DetailSection>
          <DetailSection title="Pagamentos">
            <div className="space-y-2">{(order.payments ?? []).map(payment => <div key={payment.id} className="flex items-center justify-between text-sm"><span>{paymentLabels[payment.method] ?? payment.method}{payment.cardBrand ? ` - ${payment.cardBrand}` : ''}</span><span className="font-medium tabular-nums">{formatCurrency(payment.value)}</span></div>)}{!order.payments?.length && <p className="text-sm text-muted-foreground">Nenhum pagamento informado.</p>}</div>
          </DetailSection>
          <DetailSection title="Linha do tempo">
            <ol className="relative ml-2 border-l pl-5">{events.map((event, index) => <li key={event.id ?? `${event.createdAt}-${index}`} className="relative pb-5 last:pb-0"><span className="absolute -left-[1.56rem] top-1 size-2.5 rounded-full border-2 border-background bg-primary" /><p className="text-sm font-medium">{auditEventTitle(event)}</p>{(event.reason || event.note) && <p className="mt-1 text-sm text-muted-foreground">{event.reason || event.note}</p>}<p className="mt-1 text-xs text-muted-foreground">{formatDateTime(event.createdAt)}{event.actorName ? ` - ${event.actorName}` : ''}{event.origin ? ` - ${auditOriginLabels[event.origin] ?? event.origin}` : ''}</p></li>)}{!events.length && <li className="text-sm text-muted-foreground">Nenhum evento registrado.</li>}</ol>
          </DetailSection>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-background p-4">
          <div className="flex gap-2">
            <IconButton label="Adicionar nota interna" variant="outline" size="icon" disabled={busy} onClick={onAddNote}><StickyNote className="size-4" /></IconButton>
            <IconButton label="Imprimir pedido" variant="outline" size="icon" disabled={busy} onClick={() => onPrint(order)}><Printer className="size-4" /></IconButton>
            {order.salesChannel === 'DIGITAL_MENU' && <IconButton label="Copiar link publico" variant="outline" size="icon" disabled={busy} onClick={() => onCopyTrackingLink(order)}><Copy className="size-4" /></IconButton>}
          </div>
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
  if (event.eventType === 'historical_snapshot') return 'Estado historico importado'
  if (event.eventType === 'note_added') return 'Nota interna adicionada'
  if (event.eventType === 'status_changed' && event.toStatus) {
    return event.fromStatus
      ? `${statusLabel(event.fromStatus)} -> ${statusLabel(event.toStatus)}`
      : `Status alterado para ${statusLabel(event.toStatus)}`
  }
  if (event.fromStatus || event.toStatus) return `${statusLabel(event.fromStatus)} -> ${statusLabel(event.toStatus)}`
  if (event.status) return statusLabel(event.status)
  if (event.action) return statusLabels[event.action] ?? event.action
  return event.eventType ?? 'Atualizacao do pedido'
}

function ActionDialog({ action, order, reason, estimatedMinutes, busy, onReasonChange, onEstimatedMinutesChange, onOpenChange, onConfirm }: { action: OrderAction | null; order: Order | null; reason: string; estimatedMinutes: string; busy: boolean; onReasonChange: (value: string) => void; onEstimatedMinutesChange: (value: string) => void; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  const open = !!action
  if (!action) return null
  const isAccept = action === 'accept'
  const isDestructive = action === 'reject' || action === 'cancel'
  const canConfirm = isAccept ? Number(estimatedMinutes) >= 5 : reason.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{actionLabels[action]} pedido #{order?.displayId}</DialogTitle>
          <DialogDescription>
            {isAccept
              ? 'Informe a previsao para o cliente acompanhar o pedido.'
              : 'Informe o motivo. Ele ficara registrado internamente e o cliente vera uma mensagem clara de indisponibilidade.'}
          </DialogDescription>
        </DialogHeader>
        {isAccept ? (
          <div>
            <label htmlFor="order-estimated-minutes" className="mb-2 block text-sm font-medium">Previsao em minutos</label>
            <Input
              id="order-estimated-minutes"
              type="number"
              min={5}
              max={240}
              step={5}
              value={estimatedMinutes}
              onChange={event => onEstimatedMinutesChange(event.target.value)}
            />
            <p className="mt-1 text-xs text-muted-foreground">Use um valor entre 5 e 240 minutos.</p>
          </div>
        ) : (
          <AuditTextField value={reason} onChange={onReasonChange} label="Motivo" />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Voltar</Button>
          <Button variant={isDestructive ? 'destructive' : 'default'} disabled={!canConfirm} isLoading={busy} onClick={onConfirm}>
            {isDestructive ? <Ban className="size-4" /> : <Clock3 className="size-4" />}
            {actionLabels[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReasonDialog({ open, title, description, value, confirmLabel, busy, onChange, onOpenChange, onConfirm }: { open: boolean; title: string; description: string; value: string; confirmLabel: string; busy: boolean; onChange: (value: string) => void; onOpenChange: (open: boolean) => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <AuditTextField value={value} onChange={onChange} label="Nota" />
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Voltar</Button><Button disabled={!value.trim()} isLoading={busy} onClick={onConfirm}><FilePlus2 className="size-4" />{confirmLabel}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AuditTextField({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const error = value.length > 0 && !value.trim() ? 'Informe um texto valido.' : undefined
  return <div><label htmlFor="order-reason" className="mb-2 block text-sm font-medium">{label} <span aria-hidden="true">*</span></label><Textarea id="order-reason" autoFocus rows={4} maxLength={500} value={value} error={error} onChange={event => onChange(event.target.value)} placeholder="Descreva sem dados pessoais" /><p className="mt-1 text-xs text-muted-foreground">Nao inclua telefone, CPF, CNPJ, e-mail ou endereco.</p><p className="mt-1 text-right text-xs text-muted-foreground">{value.length}/500</p></div>
}
