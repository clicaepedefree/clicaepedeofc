import type { InternalOperator } from '@/features/internal-operations/access'
import {
  updateInternalStoreProfileAction,
  updateStoreCommercialLifecycleAction,
} from '@/features/internal-operations/actions'
import {
  getVisibleInternalStoreDetailTabs,
  resolveInternalStoreDetailTab,
  type InternalStoreDetailTab,
} from '@/features/internal-operations/detail-tabs-policy'
import type { InternalStoreOverview } from '@/features/internal-operations/db'
import { canRunInternalOperation } from '@/features/internal-operations/operation-permissions'
import {
  getDefaultStoreLifecycleSubscriptionEffect,
  isFinanciallyValidForStoreActivation,
  isStoreLifecycleTransitionAllowed,
  type StoreLifecycleAccessEffect,
  type StoreLifecycleSubscriptionEffect,
  type StoreLifecycleTargetStatus,
} from '@/features/internal-operations/store-lifecycle-policy'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/dialog'
import { Input } from '@/shared/input'
import { Label } from '@/shared/label'
import { cn } from '@/shared/lib/utils'
import { Textarea } from '@/shared/textarea'
import {
  Activity,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  History,
  KeyRound,
  Layers3,
  Pencil,
  Power,
  ReceiptText,
  ShieldAlert,
  ShieldOff,
  Store,
  Users,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import type React from 'react'

type InternalStoreOverviewPanelProps = {
  operator: InternalOperator
  store: InternalStoreOverview
  requestedTab?: string
  result?: string
  error?: string
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
  result,
  error,
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

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-100">
          {error}
        </div>
      )}
      {result === 'dados-atualizados' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100">
          Dados cadastrais atualizados e registrados no historico.
        </div>
      )}
      {result === 'ciclo-comercial-atualizado' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100">
          Ciclo comercial atualizado com historico preservado.
        </div>
      )}

      {activeTab === 'dados' && (
        <DadosTab
          store={store}
          address={address}
          operator={operator}
          basePath={basePath}
        />
      )}
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
  operator,
  basePath,
}: {
  store: InternalStoreOverview
  address: string
  operator: InternalOperator
  basePath: string
}) {
  const canEdit = canRunInternalOperation({
    operator,
    operation: 'manageStoreProfile',
  })
  const canManageLifecycle = canRunInternalOperation({
    operator,
    operation: 'manageStoreLifecycle',
  })
  const disabled = store.status === 'archived'

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Cadastro da loja
          </h2>
          <p className="text-sm text-muted-foreground">
            Dados administrativos, comerciais e de contato usados pela operacao
            interna.
          </p>
        </div>
        {canEdit && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={disabled}>
                <Pencil className="size-4" />
                Editar dados
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
              <DialogHeader>
                <DialogTitle>Editar dados cadastrais</DialogTitle>
                <DialogDescription>
                  Revise os dados antes de salvar. Alteracoes sensiveis exigem
                  confirmacao e ficam registradas no historico da loja.
                </DialogDescription>
              </DialogHeader>
              <form
                action={updateInternalStoreProfileAction}
                className="space-y-5"
              >
                <input type="hidden" name="storeId" value={store.id} />
                <input
                  type="hidden"
                  name="returnTo"
                  value={`${basePath}?tab=dados`}
                />

                <FormSection title="Loja e dados comerciais">
                  <FormField label="Nome da loja" htmlFor="storeName">
                    <Input
                      id="storeName"
                      name="storeName"
                      defaultValue={store.name}
                      required
                    />
                  </FormField>
                  <FormField label="Endereco publico" htmlFor="subdomain">
                    <Input
                      id="subdomain"
                      name="subdomain"
                      defaultValue={store.subdomain}
                      required
                    />
                  </FormField>
                  <FormField label="Origem" htmlFor="acquisitionSource">
                    <Input
                      id="acquisitionSource"
                      name="acquisitionSource"
                      defaultValue={store.commercial.acquisitionSource ?? ''}
                      placeholder="Ex.: indicacao, outbound, evento"
                    />
                  </FormField>
                  <FormField label="Vendedor" htmlFor="salesOwner">
                    <Input
                      id="salesOwner"
                      name="salesOwner"
                      defaultValue={store.commercial.salesOwner ?? ''}
                    />
                  </FormField>
                </FormSection>

                <FormSection title="Empresa">
                  <FormField label="Empresa" htmlFor="companyName">
                    <Input
                      id="companyName"
                      name="companyName"
                      defaultValue={store.company.companyName ?? ''}
                    />
                  </FormField>
                  <FormField label="Novo CNPJ" htmlFor="companyTaxNumberReplacement">
                    <Input
                      id="companyTaxNumberReplacement"
                      name="companyTaxNumberReplacement"
                      placeholder={`Atual: ${store.company.companyTaxNumber}`}
                    />
                  </FormField>
                  <FormField label="E-mail da loja" htmlFor="companyEmail">
                    <Input
                      id="companyEmail"
                      name="companyEmail"
                      type="email"
                      defaultValue={store.company.email ?? ''}
                    />
                  </FormField>
                  <FormField label="Telefone 1" htmlFor="phone1">
                    <Input
                      id="phone1"
                      name="phone1"
                      defaultValue={store.company.phone1 ?? ''}
                    />
                  </FormField>
                  <FormField label="Telefone 2" htmlFor="phone2">
                    <Input
                      id="phone2"
                      name="phone2"
                      defaultValue={store.company.phone2 ?? ''}
                    />
                  </FormField>
                </FormSection>

                <FormSection title="Responsavel">
                  <FormField label="Nome" htmlFor="responsibleName">
                    <Input
                      id="responsibleName"
                      name="responsibleName"
                      defaultValue={store.company.responsibleName ?? ''}
                      required
                    />
                  </FormField>
                  <FormField label="Novo CPF" htmlFor="responsibleTaxNumberReplacement">
                    <Input
                      id="responsibleTaxNumberReplacement"
                      name="responsibleTaxNumberReplacement"
                      placeholder={`Atual: ${store.company.responsibleTaxNumber}`}
                    />
                  </FormField>
                  <FormField label="E-mail" htmlFor="responsibleEmail">
                    <Input
                      id="responsibleEmail"
                      name="responsibleEmail"
                      type="email"
                      defaultValue={store.company.responsibleEmail ?? ''}
                    />
                  </FormField>
                  <FormField label="Telefone" htmlFor="responsiblePhone">
                    <Input
                      id="responsiblePhone"
                      name="responsiblePhone"
                      defaultValue={store.company.responsiblePhone ?? ''}
                    />
                  </FormField>
                </FormSection>

                <FormSection title="Endereco">
                  <FormField label="CEP" htmlFor="postalCode">
                    <Input
                      id="postalCode"
                      name="postalCode"
                      defaultValue={store.address.postalCode ?? ''}
                      required
                    />
                  </FormField>
                  <FormField label="Endereco" htmlFor="street">
                    <Input
                      id="street"
                      name="street"
                      defaultValue={store.address.street ?? ''}
                      required
                    />
                  </FormField>
                  <FormField label="Numero" htmlFor="number">
                    <Input
                      id="number"
                      name="number"
                      defaultValue={store.address.number ?? ''}
                      required
                    />
                  </FormField>
                  <FormField label="Bairro" htmlFor="district">
                    <Input
                      id="district"
                      name="district"
                      defaultValue={store.address.district ?? ''}
                      required
                    />
                  </FormField>
                  <FormField label="Cidade" htmlFor="city">
                    <Input
                      id="city"
                      name="city"
                      defaultValue={store.address.city ?? ''}
                      required
                    />
                  </FormField>
                  <FormField label="UF" htmlFor="stateCode">
                    <Input
                      id="stateCode"
                      name="stateCode"
                      defaultValue={store.address.stateCode ?? ''}
                      maxLength={2}
                      required
                    />
                  </FormField>
                </FormSection>

                <div className="grid gap-4">
                  <FormField label="Observacoes internas" htmlFor="internalNotes">
                    <Textarea
                      id="internalNotes"
                      name="internalNotes"
                      defaultValue={store.commercial.internalNotes ?? ''}
                      placeholder="Contexto comercial, alinhamentos com o cliente ou combinados internos."
                    />
                  </FormField>
                  <FormField label="Motivo da alteracao" htmlFor="reason">
                    <Textarea
                      id="reason"
                      name="reason"
                      placeholder="Ex.: correcao solicitada pelo responsavel da loja."
                      required
                    />
                  </FormField>
                </div>

                <label className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                  <input
                    type="checkbox"
                    name="sensitiveConfirmation"
                    className="mt-1 size-4"
                  />
                  <span>
                    <span className="flex items-center gap-2 font-medium">
                      <ShieldAlert className="size-4" />
                      Confirmo mudancas sensiveis
                    </span>
                    <span className="mt-1 block text-xs">
                      Obrigatorio quando alterar nome da loja, endereco
                      publico, CNPJ, CPF ou e-mail do responsavel.
                    </span>
                  </span>
                </label>

                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Cancelar
                    </Button>
                  </DialogClose>
                  <Button type="submit">
                    <Pencil className="size-4" />
                    Salvar alteracoes
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {disabled && canEdit && (
        <EmptyState>
          Loja arquivada nao permite alteracao cadastral. Consulte o historico
          antes de qualquer nova acao operacional.
        </EmptyState>
      )}

      <StoreLifecyclePanel
        store={store}
        basePath={basePath}
        canManageLifecycle={canManageLifecycle}
      />

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
            <DetailField label="Cancelada em" value={formatDateTime(store.cancelledAt)} />
            <DetailField label="Motivo do cancelamento" value={store.cancellationReason} />
          </CardContent>
        </Card>
        <Card className="rounded-lg py-5 shadow-xs hover:shadow-xs lg:col-span-2">
          <CardHeader>
            <CardTitle>Dados comerciais</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <DetailField label="Origem" value={store.commercial.acquisitionSource} />
            <DetailField label="Vendedor" value={store.commercial.salesOwner} />
            <DetailField label="Observacoes internas" value={store.commercial.internalNotes} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

type StoreLifecycleActionConfig = {
  targetStatus: StoreLifecycleTargetStatus
  title: string
  description: string
  buttonLabel: string
  icon: typeof Store
  variant: 'default' | 'outline' | 'destructive'
  defaultSubscriptionEffect: StoreLifecycleSubscriptionEffect
  defaultAccessEffect: StoreLifecycleAccessEffect
  reasonPlaceholder: string
  confirmationLabel?: string
  blockedReason?: string
  changes: string[]
  unchanged: string[]
}

const selectClassName =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

function StoreLifecyclePanel({
  store,
  basePath,
  canManageLifecycle,
}: {
  store: InternalStoreOverview
  basePath: string
  canManageLifecycle: boolean
}) {
  const subscriptionSnapshot = {
    id: store.billing.subscriptionId,
    status: store.billing.subscriptionStatus,
    planId: store.billing.planId,
    contractedAmount: store.billing.contractedAmount,
    currency: store.billing.currency,
    currentPeriodStart: store.billing.currentPeriodStart,
    currentPeriodEnd: store.billing.currentPeriodEnd,
    nextBillingAt: store.billing.nextBillingAt,
  }
  const hasValidFinancialConfig =
    isFinanciallyValidForStoreActivation(subscriptionSnapshot)
  const activeAdmins = store.users.filter(user => !user.revokedAt).length
  const activeLabel =
    store.status === 'implementing' ? 'Ativar comercialmente' : 'Reativar'

  const actionConfigs: StoreLifecycleActionConfig[] = [
    {
      targetStatus: 'active',
      title: activeLabel,
      description:
        store.status === 'implementing'
          ? 'A loja sai de implantacao e passa a operar como ativa.'
          : 'A loja volta a operar como ativa preservando historico.',
      buttonLabel: activeLabel,
      icon: Power,
      variant: 'default',
      defaultSubscriptionEffect: getDefaultStoreLifecycleSubscriptionEffect({
        targetStatus: 'active',
        subscriptionStatus: store.billing.subscriptionStatus,
      }),
      defaultAccessEffect: 'keep_access',
      reasonPlaceholder: 'Ex.: cliente regularizou assinatura e liberamos a operacao.',
      blockedReason: !hasValidFinancialConfig
        ? 'Configure plano, valor e periodo financeiro antes de ativar.'
        : undefined,
      changes: ['Status comercial da loja', 'Historico operacional'],
      unchanged: [
        'Pedidos, faturas e eventos anteriores',
        'Acessos de usuarios ja existentes',
      ],
    },
    {
      targetStatus: 'inactive',
      title: 'Inativar comercialmente',
      description:
        'Pausa a operacao comercial interna sem apagar dados da loja.',
      buttonLabel: 'Inativar',
      icon: ShieldOff,
      variant: 'outline',
      defaultSubscriptionEffect: 'pause_subscription',
      defaultAccessEffect: 'keep_access',
      reasonPlaceholder: 'Ex.: cliente pausou operacao por negociacao comercial.',
      changes: ['Status comercial da loja', 'Opcionalmente assinatura e acesso'],
      unchanged: ['Pedidos, faturas, produtos e historico cadastral'],
    },
    {
      targetStatus: 'archived',
      title: 'Cancelar comercialmente',
      description:
        'Encerra comercialmente a loja, registra data e motivo, mas preserva todo o historico.',
      buttonLabel: 'Cancelar loja',
      icon: XCircle,
      variant: 'destructive',
      defaultSubscriptionEffect: 'cancel_subscription',
      defaultAccessEffect: 'revoke_access',
      confirmationLabel: `Digite ${store.subdomain} para confirmar`,
      reasonPlaceholder: 'Ex.: cliente solicitou cancelamento definitivo em atendimento.',
      changes: [
        'Status comercial para Arquivada',
        'Data e motivo de cancelamento',
        'Opcionalmente assinatura e acesso',
      ],
      unchanged: ['Pedidos, faturas, produtos, auditoria e dados historicos'],
    },
  ]

  return (
    <Card className="rounded-lg py-5 shadow-xs hover:shadow-xs">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Ciclo comercial</CardTitle>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Controle ativacao, inativacao e cancelamento sem misturar status
              da loja, assinatura e acesso dos usuarios.
            </p>
          </div>
          <Badge variant="outline">{statusLabels[store.status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <DetailField label="Status atual" value={statusLabels[store.status]} />
          <DetailField
            label="Assinatura"
            value={store.billing.subscriptionStatus ?? 'Sem assinatura aberta'}
          />
          <DetailField label="Acessos ativos" value={String(activeAdmins)} />
          <DetailField
            label="Ultima alteracao"
            value={formatDateTime(store.statusUpdatedAt)}
          />
        </div>

        {store.cancelledAt && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-100">
            <div className="font-medium">
              Cancelada em {formatDateTime(store.cancelledAt)}
            </div>
            <p className="mt-1 text-rose-800 dark:text-rose-200">
              {store.cancellationReason ?? 'Sem motivo registrado.'}
            </p>
          </div>
        )}

        {!canManageLifecycle && (
          <EmptyState>
            Seu perfil pode consultar o ciclo comercial, mas nao pode executar
            transicoes de status.
          </EmptyState>
        )}

        {canManageLifecycle && (
          <div className="grid gap-3 lg:grid-cols-3">
            {actionConfigs.map(action => {
              const transitionAllowed = isStoreLifecycleTransitionAllowed({
                currentStatus: store.status,
                targetStatus: action.targetStatus,
              })
              const isBlocked =
                !transitionAllowed ||
                (action.targetStatus === 'active' && !hasValidFinancialConfig)

              return (
                <StoreLifecycleActionDialog
                  key={action.targetStatus}
                  store={store}
                  basePath={basePath}
                  action={action}
                  disabled={isBlocked}
                  disabledReason={
                    !transitionAllowed
                      ? 'Acao indisponivel para o status atual.'
                      : action.blockedReason
                  }
                />
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StoreLifecycleActionDialog({
  store,
  basePath,
  action,
  disabled,
  disabledReason,
}: {
  store: InternalStoreOverview
  basePath: string
  action: StoreLifecycleActionConfig
  disabled: boolean
  disabledReason?: string
}) {
  const Icon = action.icon

  return (
    <div className="rounded-lg border bg-background/70 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="size-4" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{action.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {action.description}
          </p>
        </div>
      </div>

      {disabledReason && (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
          {disabledReason}
        </p>
      )}

      <Dialog>
        <DialogTrigger asChild>
          <Button
            className="mt-4 w-full"
            variant={action.variant}
            disabled={disabled}
          >
            <Icon className="size-4" />
            {action.buttonLabel}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{action.title}</DialogTitle>
            <DialogDescription>{action.description}</DialogDescription>
          </DialogHeader>

          <form
            action={updateStoreCommercialLifecycleAction}
            className="space-y-5"
          >
            <input type="hidden" name="storeId" value={store.id} />
            <input type="hidden" name="targetStatus" value={action.targetStatus} />
            <input
              type="hidden"
              name="returnTo"
              value={`${basePath}?tab=dados`}
            />

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border bg-emerald-50/60 p-4 text-sm dark:border-emerald-900/70 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2 font-medium text-emerald-900 dark:text-emerald-100">
                  <CheckCircle2 className="size-4" />
                  Esta acao altera
                </div>
                <ul className="mt-3 space-y-2 text-emerald-800 dark:text-emerald-200">
                  {action.changes.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <div className="font-medium text-foreground">
                  Nao sera apagado
                </div>
                <ul className="mt-3 space-y-2 text-muted-foreground">
                  {action.unchanged.map(item => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <FormField label="Efeito sobre assinatura" htmlFor={`subscriptionEffect-${action.targetStatus}`}>
              <select
                id={`subscriptionEffect-${action.targetStatus}`}
                name="subscriptionEffect"
                className={selectClassName}
                defaultValue={action.defaultSubscriptionEffect}
              >
                <option value="keep_subscription">Manter assinatura como esta</option>
                {action.targetStatus !== 'active' && (
                  <option value="pause_subscription">Pausar assinatura</option>
                )}
                {action.targetStatus === 'active' && (
                  <option value="resume_subscription">Retomar assinatura pausada</option>
                )}
                {action.targetStatus === 'archived' && (
                  <option value="cancel_subscription">Cancelar assinatura</option>
                )}
              </select>
            </FormField>

            <FormField label="Efeito sobre acesso" htmlFor={`accessEffect-${action.targetStatus}`}>
              <select
                id={`accessEffect-${action.targetStatus}`}
                name="accessEffect"
                className={selectClassName}
                defaultValue={action.defaultAccessEffect}
                disabled={action.targetStatus === 'active'}
              >
                <option value="keep_access">Manter acessos como estao</option>
                {action.targetStatus !== 'active' && (
                  <option value="revoke_access">Revogar acessos ativos</option>
                )}
              </select>
              {action.targetStatus === 'active' && (
                <input type="hidden" name="accessEffect" value="keep_access" />
              )}
            </FormField>

            <FormField label="Motivo" htmlFor={`reason-${action.targetStatus}`}>
              <Textarea
                id={`reason-${action.targetStatus}`}
                name="reason"
                placeholder={action.reasonPlaceholder}
                required
              />
            </FormField>

            {action.confirmationLabel && (
              <FormField
                label={action.confirmationLabel}
                htmlFor={`confirmation-${action.targetStatus}`}
              >
                <Input
                  id={`confirmation-${action.targetStatus}`}
                  name="confirmation"
                  placeholder={store.subdomain}
                  required
                />
              </FormField>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Voltar
                </Button>
              </DialogClose>
              <Button type="submit" variant={action.variant}>
                <Icon className="size-4" />
                Confirmar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FormSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border bg-muted/20 p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  )
}

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} size="sm">
        {label}
      </Label>
      {children}
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
