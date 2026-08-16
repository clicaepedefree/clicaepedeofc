import type { InternalOperator } from '@/features/internal-operations/access'
import {
  getVisibleInternalStoreDetailTabs,
  resolveInternalStoreDetailTab,
  type InternalStoreDetailTab,
} from '@/features/internal-operations/detail-tabs-policy'
import type { InternalStoreOverview } from '@/features/internal-operations/db'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/card'
import { cn } from '@/shared/lib/utils'
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  CircleDollarSign,
  Clock,
  History,
  KeyRound,
  Layers3,
  ReceiptText,
  Store,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import type React from 'react'

type InternalStoreOverviewPanelProps = {
  operator: InternalOperator
  store: InternalStoreOverview
  requestedTab?: string
  basePath: string
}

const tabIcons: Record<InternalStoreDetailTab, typeof Store> = {
  dados: Store,
  faturas: ReceiptText,
  plano: CircleDollarSign,
  modulos: Layers3,
  metricas: Activity,
  usuarios: Users,
  historico: History,
}

const statusLabels: Record<InternalStoreOverview['status'], string> = {
  implementing: 'Em implantacao',
  active: 'Ativa',
  inactive: 'Inativa',
  pending_recovery: 'Pendente',
  archived: 'Arquivada',
}

const formatDateTime = (date: Date | string | null) => {
  if (!date) return 'Nao registrado'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

const formatDate = (date: Date | string | null) => {
  if (!date) return 'Nao informado'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

const formatCurrency = (value: string | number | null, currency = 'BRL') => {
  if (value === null || value === undefined || value === '') return 'Sem valor'

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(Number(value))
}

const DetailField = ({
  label,
  value,
}: {
  label: string
  value: string | number | null | undefined
}) => (
  <div className="space-y-1 rounded-md border bg-background/70 p-3">
    <div className="text-xs font-medium text-muted-foreground">{label}</div>
    <div className="text-sm font-medium text-foreground">
      {value || 'Nao informado'}
    </div>
  </div>
)

const EmptyState = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
    {children}
  </div>
)

export function InternalStoreOverviewPanel({
  operator,
  store,
  requestedTab,
  basePath,
}: InternalStoreOverviewPanelProps) {
  const visibleTabs = getVisibleInternalStoreDetailTabs(operator.role)
  const activeTab = resolveInternalStoreDetailTab({
    requestedTab,
    role: operator.role,
  })
  const address = [
    store.address.street,
    store.address.number,
    store.address.district,
    store.address.city,
    store.address.stateCode,
  ]
    .filter(Boolean)
    .join(' - ')
  const currency = store.billing.currency ?? 'BRL'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <Button asChild variant="outline" size="sm" isClickable>
            <Link href="/internal/stores">
              <ArrowLeft className="size-4" />
              Voltar para lojas
            </Link>
          </Button>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Operacao interna
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {store.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>#{store.id}</span>
              <span>{store.subdomain}</span>
              <Badge variant="outline">{statusLabels[store.status]}</Badge>
              <Badge variant="outline">
                {store.billing.subscriptionStatus ?? 'sem assinatura'}
              </Badge>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 text-sm md:min-w-[280px]">
          <div className="font-medium text-foreground">Ultimo acesso</div>
          <div className="mt-1 text-muted-foreground">
            {formatDateTime(store.metrics.lastAccessAt)}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            Considera o acesso mais recente dos usuarios vinculados a loja.
          </div>
        </div>
      </div>

      <section className="grid gap-3 lg:grid-cols-5">
        <SummaryCard
          icon={CircleDollarSign}
          label="Plano"
          value={store.billing.planName ?? 'Sem plano'}
          detail={formatCurrency(store.billing.contractedAmount, currency)}
        />
        <SummaryCard
          icon={CalendarClock}
          label="Proxima cobranca"
          value={formatDate(store.billing.nextBillingAt)}
          detail={store.billing.subscriptionStatus ?? 'sem assinatura'}
        />
        <SummaryCard
          icon={Clock}
          label="Criada em"
          value={formatDate(store.createdAt)}
          detail={`Atualizada ${formatDate(store.updatedAt)}`}
        />
        <SummaryCard
          icon={ReceiptText}
          label="Faturas abertas"
          value={String(store.invoiceSummary.openInvoices)}
          detail={formatCurrency(store.invoiceSummary.openAmount, currency)}
        />
        <SummaryCard
          icon={Activity}
          label="Pedidos"
          value={String(store.metrics.totalOrders)}
          detail={formatCurrency(store.metrics.grossRevenue, currency)}
        />
      </section>

      <nav className="flex gap-2 overflow-x-auto rounded-lg border bg-card p-2">
        {visibleTabs.map(tab => {
          const Icon = tabIcons[tab.value]
          const isActive = tab.value === activeTab

          return (
            <Button
              key={tab.value}
              asChild
              size="sm"
              variant={isActive ? 'default' : 'ghost'}
              isClickable
              className="shrink-0"
            >
              <Link href={`${basePath}?tab=${tab.value}`}>
                <Icon className="size-4" />
                {tab.label}
              </Link>
            </Button>
          )
        })}
      </nav>

      {activeTab === 'dados' && <DadosTab store={store} address={address} />}
      {activeTab === 'faturas' && <FaturasTab store={store} />}
      {activeTab === 'plano' && <PlanoTab store={store} />}
      {activeTab === 'modulos' && <ModulosTab store={store} />}
      {activeTab === 'metricas' && <MetricasTab store={store} />}
      {activeTab === 'usuarios' && <UsuariosTab store={store} />}
      {activeTab === 'historico' && <HistoricoTab store={store} />}
    </div>
  )
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Store
  label: string
  value: string
  detail: string
}) {
  return (
    <Card className="rounded-lg py-4 shadow-xs hover:shadow-xs">
      <CardHeader className="flex flex-row items-center gap-2 px-4">
        <Icon className="size-4 text-primary" />
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-4">
        <div className="text-lg font-semibold text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  )
}

function DadosTab({
  store,
  address,
}: {
  store: InternalStoreOverview
  address: string
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="rounded-lg py-5 shadow-xs hover:shadow-xs">
        <CardHeader>
          <CardTitle>Dados da empresa</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <DetailField label="Razao/Nome fantasia" value={store.company.companyName} />
          <DetailField label="CNPJ" value={store.company.companyTaxNumber} />
          <DetailField label="E-mail" value={store.company.email} />
          <DetailField label="Telefone principal" value={store.company.phone1} />
          <DetailField label="Telefone secundario" value={store.company.phone2} />
          <DetailField label="Endereco" value={address || null} />
        </CardContent>
      </Card>
      <Card className="rounded-lg py-5 shadow-xs hover:shadow-xs">
        <CardHeader>
          <CardTitle>Responsavel</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <DetailField label="Nome" value={store.company.responsibleName} />
          <DetailField label="CPF" value={store.company.responsibleTaxNumber} />
          <DetailField label="E-mail" value={store.company.responsibleEmail} />
          <DetailField label="Telefone" value={store.company.responsiblePhone} />
          <DetailField label="Status da loja" value={statusLabels[store.status]} />
          <DetailField label="Motivo/status" value={store.statusReason} />
        </CardContent>
      </Card>
    </div>
  )
}

function FaturasTab({ store }: { store: InternalStoreOverview }) {
  if (store.invoices.length === 0) {
    return <EmptyState>Nenhuma fatura gerada para esta loja.</EmptyState>
  }

  return (
    <div className="rounded-lg border bg-card">
      <TableLike
        headers={['Fatura', 'Status', 'Vencimento', 'Total', 'Pago']}
        rows={store.invoices.map(invoice => [
          invoice.invoiceNumber,
          invoice.status,
          formatDate(invoice.dueAt),
          formatCurrency(invoice.totalAmount, invoice.currency),
          formatCurrency(invoice.amountPaid, invoice.currency),
        ])}
      />
    </div>
  )
}

function PlanoTab({ store }: { store: InternalStoreOverview }) {
  const currency = store.billing.currency ?? 'BRL'

  return (
    <Card className="rounded-lg py-5 shadow-xs hover:shadow-xs">
      <CardHeader>
        <CardTitle>Assinatura</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        <DetailField label="Plano" value={store.billing.planName} />
        <DetailField label="Codigo" value={store.billing.planCode} />
        <DetailField
          label="Valor contratado"
          value={formatCurrency(store.billing.contractedAmount, currency)}
        />
        <DetailField
          label="Status"
          value={store.billing.subscriptionStatus ?? 'Sem assinatura ativa'}
        />
        <DetailField label="Inicio do periodo" value={formatDate(store.billing.currentPeriodStart)} />
        <DetailField label="Fim do periodo" value={formatDate(store.billing.currentPeriodEnd)} />
      </CardContent>
    </Card>
  )
}

function ModulosTab({ store }: { store: InternalStoreOverview }) {
  if (store.modules.length === 0) {
    return <EmptyState>Nenhum modulo liberado para esta loja.</EmptyState>
  }

  return (
    <div className="rounded-lg border bg-card">
      <TableLike
        headers={['Modulo', 'Origem', 'Status', 'Adicional', 'Vigencia']}
        rows={store.modules.map(module => [
          module.name,
          module.origin,
          module.status,
          module.isAdditional
            ? formatCurrency(module.additionalAmount, module.currency)
            : 'Nao',
          `${formatDate(module.startsAt)} ate ${formatDate(module.endsAt)}`,
        ])}
      />
    </div>
  )
}

function MetricasTab({ store }: { store: InternalStoreOverview }) {
  return (
    <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      <SummaryCard
        icon={Activity}
        label="Pedidos totais"
        value={String(store.metrics.totalOrders)}
        detail={`Ultimo pedido ${formatDateTime(store.metrics.lastOrderAt)}`}
      />
      <SummaryCard
        icon={Store}
        label="Cardapio digital"
        value={String(store.metrics.digitalMenuOrders)}
        detail="Pedidos recebidos pelo cardapio"
      />
      <SummaryCard
        icon={KeyRound}
        label="POS"
        value={String(store.metrics.posOrders)}
        detail="Pedidos feitos no caixa"
      />
      <SummaryCard
        icon={CircleDollarSign}
        label="Receita bruta"
        value={formatCurrency(store.metrics.grossRevenue, store.billing.currency ?? 'BRL')}
        detail="Soma historica dos pedidos"
      />
    </section>
  )
}

function UsuariosTab({ store }: { store: InternalStoreOverview }) {
  if (store.users.length === 0) {
    return <EmptyState>Sem usuario vinculado a esta loja.</EmptyState>
  }

  return (
    <div className="rounded-lg border bg-card">
      <TableLike
        headers={['Usuario', 'Perfil', 'Status', 'Ultimo acesso', 'Acesso']}
        rows={store.users.map(user => [
          `${user.email}${user.name ? ` - ${user.name}` : ''}`,
          user.isPrimaryResponsible ? `${user.role} principal` : user.role,
          user.status,
          formatDateTime(user.lastLoginAt),
          user.revokedAt
            ? `Revogado em ${formatDate(user.revokedAt)}`
            : `Ativo desde ${formatDate(user.permissionCreatedAt)}`,
        ])}
      />
    </div>
  )
}

function HistoricoTab({ store }: { store: InternalStoreOverview }) {
  const events = [
    ...store.auditLogs.map(log => ({
      id: `audit-${log.id}`,
      label: log.action,
      actor: log.actorEmail,
      detail: `${log.previousStoreStatus} para ${log.newStoreStatus} - ${log.reason}`,
      createdAt: log.createdAt,
    })),
    ...store.billingEvents.map(event => ({
      id: `billing-${event.id}`,
      label: event.eventType,
      actor: event.actorEmail ?? 'sistema',
      detail: event.reason ?? 'Evento financeiro registrado',
      createdAt: event.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  if (events.length === 0) {
    return <EmptyState>Nenhum evento registrado para esta loja.</EmptyState>
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="divide-y">
        {events.map(event => (
          <div
            key={event.id}
            className="flex flex-col gap-2 px-5 py-4 md:flex-row md:items-start md:justify-between"
          >
            <div>
              <Badge variant="outline">{event.label}</Badge>
              <p className="mt-2 text-sm text-foreground">{event.detail}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {event.actor}
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              {formatDateTime(event.createdAt)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TableLike({
  headers,
  rows,
}: {
  headers: string[]
  rows: string[][]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b bg-muted/60 text-left">
            {headers.map(header => (
              <th key={header} className="px-4 py-3 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr
              key={row.join('-') || rowIndex}
              className={cn('border-b last:border-b-0', {
                'bg-muted/20': rowIndex % 2 === 1,
              })}
            >
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`} className="px-4 py-3">
                  {cell || 'Nao informado'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
