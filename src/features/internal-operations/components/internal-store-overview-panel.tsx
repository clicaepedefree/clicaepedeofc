import type { InternalOperator } from '@/features/internal-operations/access'
import {
  adjustBillingInvoiceAmountAction,
  changeStoreSubscriptionPlanAction,
  blockStoreAccessAction,
  cancelBillingInvoiceAction,
  createManualBillingInvoiceAction,
  manageStoreModuleEntitlementAction,
  markManualBillingInvoicePaymentAction,
  refundBillingInvoiceAction,
  rescheduleBillingInvoiceDueDateAction,
  unblockStoreAccessAction,
  updateInternalStoreProfileAction,
  updateStoreCommercialLifecycleAction,
  updateStoreSubscriptionTermsAction,
} from '@/features/internal-operations/actions'
import {
  getVisibleInternalStoreDetailTabs,
  resolveInternalStoreDetailTab,
  type InternalStoreDetailTab,
} from '@/features/internal-operations/detail-tabs-policy'
import type {
  InternalBillingPlanOption,
  InternalStoreOverview,
} from '@/features/internal-operations/db'
import {
  getModuleTreatmentLabel,
  getPlanChangeTimingLabel,
  getProrationPolicyLabel,
} from '@/features/internal-operations/subscription-plan-change-policy'
import {
  canCopyInternalInvoicePaymentLink,
  getInternalInvoiceStatusLabel,
  getInternalInvoiceStatusTone,
  getInternalInvoiceFilterDescription,
  internalInvoiceStatusFilters,
  parseInternalInvoiceStatusFilter,
  type InternalInvoiceStatusFilter,
} from '@/features/internal-operations/billing-invoices-policy'
import {
  canRunManualBillingAction,
  getManualInvoiceRefundableAmount,
} from '@/features/internal-operations/billing-manual-actions-policy'
import { CopyInvoicePaymentLinkButton } from '@/features/internal-operations/components/copy-invoice-payment-link-button'
import { SubscriptionPlanModuleImpactPreview } from '@/features/internal-operations/components/subscription-plan-module-impact-preview'
import { getModuleEntitlementOriginLabel } from '@/features/internal-operations/store-module-management-policy'
import { canRunInternalOperation } from '@/features/internal-operations/operation-permissions'
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
import {
  getBillingIntervalLabel,
  getDiscountLabel,
  getExpectedSubscriptionBlockAt,
} from '@/features/internal-operations/subscription-terms-policy'
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
  Eye,
  FilePenLine,
  History,
  KeyRound,
  Layers3,
  LockKeyhole,
  Pencil,
  Power,
  PowerOff,
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
  billingPlans: InternalBillingPlanOption[]
  requestedTab?: string
  invoiceStatus?: string
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

const formatDateTimeLocalValue = (date: Date | string | null) => {
  if (!date) return ''

  const parsedDate = new Date(date)
  if (Number.isNaN(parsedDate.getTime())) return ''

  const offsetMs = parsedDate.getTimezoneOffset() * 60 * 1000
  return new Date(parsedDate.getTime() - offsetMs).toISOString().slice(0, 16)
}

const formatCurrency = (value: string | number | null, currency = 'BRL') => {
  if (value === null || value === undefined || value === '') return 'Sem valor'

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(Number(value))
}

const getProrationAdjustmentLabel = (type: string) => {
  if (type === 'debit') return 'Cobranca adicional'
  if (type === 'credit') return 'Credito'

  return 'Sem ajuste'
}

const getProrationStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    open: 'Aberto',
    invoiced: 'Faturado',
    applied: 'Aplicado',
    recorded: 'Registrado',
    waived: 'Isento',
    cancelled: 'Cancelado',
  }

  return labels[status] ?? status
}

const getProrationNumber = (
  snapshot: Record<string, unknown> | null | undefined,
  key: string
) => {
  const value = snapshot?.[key]
  if (typeof value === 'number') return value
  if (typeof value === 'string') return Number(value)

  return 0
}

const getProrationString = (
  snapshot: Record<string, unknown> | null | undefined,
  key: string
) => {
  const value = snapshot?.[key]
  return typeof value === 'string' ? value : ''
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
  billingPlans,
  requestedTab,
  invoiceStatus,
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
      {result === 'acesso-loja-bloqueado' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100">
          Acesso da loja bloqueado com auditoria registrada.
        </div>
      )}
      {result === 'acesso-loja-desbloqueado' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100">
          Acesso da loja desbloqueado sem alterar o historico.
        </div>
      )}
      {result === 'condicao-plano-atualizada' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100">
          Condicao especifica do plano atualizada com auditoria financeira.
        </div>
      )}
      {result === 'mudanca-plano-aplicada' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100">
          Mudanca de plano aplicada agora, com assinatura nova e historico
          preservado.
        </div>
      )}
      {result === 'mudanca-plano-programada' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100">
          Mudanca de plano programada para a proxima renovacao sem alterar a
          assinatura atual.
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
      {activeTab === 'faturas' && (
        <FaturasTab
          store={store}
          operator={operator}
          basePath={basePath}
          invoiceStatus={invoiceStatus}
        />
      )}
      {activeTab === 'plano' && (
        <PlanoTab
          store={store}
          operator={operator}
          basePath={basePath}
          billingPlans={billingPlans}
        />
      )}
      {activeTab === 'modulos' && (
        <ModulosTab store={store} operator={operator} basePath={basePath} />
      )}
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
  const canManageAccessBlock = canRunInternalOperation({
    operator,
    operation: 'blockStore',
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
                  <FormField
                    label="Novo CNPJ"
                    htmlFor="companyTaxNumberReplacement"
                  >
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
                  <FormField
                    label="Novo CPF"
                    htmlFor="responsibleTaxNumberReplacement"
                  >
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
                  <FormField
                    label="Observacoes internas"
                    htmlFor="internalNotes"
                  >
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
                      Obrigatorio quando alterar nome da loja, endereco publico,
                      CNPJ, CPF ou e-mail do responsavel.
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

      <StoreAccessBlockPanel
        store={store}
        basePath={basePath}
        canManageAccessBlock={canManageAccessBlock}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-lg py-5 shadow-xs hover:shadow-xs">
          <CardHeader>
            <CardTitle>Dados da empresa</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <DetailField
              label="Razao/Nome fantasia"
              value={store.company.companyName}
            />
            <DetailField label="CNPJ" value={store.company.companyTaxNumber} />
            <DetailField label="E-mail" value={store.company.email} />
            <DetailField
              label="Telefone principal"
              value={store.company.phone1}
            />
            <DetailField
              label="Telefone secundario"
              value={store.company.phone2}
            />
            <DetailField label="Endereco" value={address || null} />
          </CardContent>
        </Card>
        <Card className="rounded-lg py-5 shadow-xs hover:shadow-xs">
          <CardHeader>
            <CardTitle>Responsavel</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <DetailField label="Nome" value={store.company.responsibleName} />
            <DetailField
              label="CPF"
              value={store.company.responsibleTaxNumber}
            />
            <DetailField
              label="E-mail"
              value={store.company.responsibleEmail}
            />
            <DetailField
              label="Telefone"
              value={store.company.responsiblePhone}
            />
            <DetailField
              label="Status da loja"
              value={statusLabels[store.status]}
            />
            <DetailField label="Motivo/status" value={store.statusReason} />
            <DetailField
              label="Cancelada em"
              value={formatDateTime(store.cancelledAt)}
            />
            <DetailField
              label="Motivo do cancelamento"
              value={store.cancellationReason}
            />
          </CardContent>
        </Card>
        <Card className="rounded-lg py-5 shadow-xs hover:shadow-xs lg:col-span-2">
          <CardHeader>
            <CardTitle>Dados comerciais</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <DetailField
              label="Origem"
              value={store.commercial.acquisitionSource}
            />
            <DetailField label="Vendedor" value={store.commercial.salesOwner} />
            <DetailField
              label="Observacoes internas"
              value={store.commercial.internalNotes}
            />
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
      reasonPlaceholder:
        'Ex.: cliente regularizou assinatura e liberamos a operacao.',
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
      reasonPlaceholder:
        'Ex.: cliente pausou operacao por negociacao comercial.',
      changes: [
        'Status comercial da loja',
        'Opcionalmente assinatura e acesso',
      ],
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
      reasonPlaceholder:
        'Ex.: cliente solicitou cancelamento definitivo em atendimento.',
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
          <DetailField
            label="Status atual"
            value={statusLabels[store.status]}
          />
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
            <input
              type="hidden"
              name="targetStatus"
              value={action.targetStatus}
            />
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

            <FormField
              label="Efeito sobre assinatura"
              htmlFor={`subscriptionEffect-${action.targetStatus}`}
            >
              <select
                id={`subscriptionEffect-${action.targetStatus}`}
                name="subscriptionEffect"
                className={selectClassName}
                defaultValue={action.defaultSubscriptionEffect}
              >
                <option value="keep_subscription">
                  Manter assinatura como esta
                </option>
                {action.targetStatus !== 'active' && (
                  <option value="pause_subscription">Pausar assinatura</option>
                )}
                {action.targetStatus === 'active' && (
                  <option value="resume_subscription">
                    Retomar assinatura pausada
                  </option>
                )}
                {action.targetStatus === 'archived' && (
                  <option value="cancel_subscription">
                    Cancelar assinatura
                  </option>
                )}
              </select>
            </FormField>

            <FormField
              label="Efeito sobre acesso"
              htmlFor={`accessEffect-${action.targetStatus}`}
            >
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

function StoreAccessBlockPanel({
  store,
  basePath,
  canManageAccessBlock,
}: {
  store: InternalStoreOverview
  basePath: string
  canManageAccessBlock: boolean
}) {
  const activeBlock = store.accessBlock?.isActive ? store.accessBlock : null
  const isArchived = store.status === 'archived'
  const statusLabel = activeBlock ? 'Bloqueado' : 'Liberado'
  const statusTone = activeBlock
    ? 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100'
    : 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100'

  return (
    <Card className="rounded-lg py-5 shadow-xs hover:shadow-xs">
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle>Acesso da loja</CardTitle>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Bloqueia ou libera o login dos usuarios da loja sem alterar status
              comercial, assinatura, plano, faturas ou pedidos.
            </p>
          </div>
          <Badge variant="outline" className={cn('border', statusTone)}>
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <DetailField label="Situacao do acesso" value={statusLabel} />
          <DetailField
            label="Motivo atual"
            value={activeBlock?.reason ?? 'Sem bloqueio ativo'}
          />
          <DetailField
            label="Bloqueado em"
            value={activeBlock ? formatDateTime(activeBlock.blockedAt) : null}
          />
          <DetailField
            label="Desbloqueio programado"
            value={
              activeBlock
                ? formatDateTime(activeBlock.scheduledUnblockAt)
                : null
            }
          />
        </div>

        {store.accessBlock && !store.accessBlock.isActive && (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
            Ultimo bloqueio encerrado:{' '}
            {store.accessBlock.unblockReason ?? 'sem motivo informado'}.
          </div>
        )}

        {!canManageAccessBlock && (
          <EmptyState>
            Seu perfil pode consultar o acesso da loja, mas nao pode bloquear ou
            desbloquear login dos usuarios.
          </EmptyState>
        )}

        {isArchived && canManageAccessBlock && (
          <EmptyState>
            Loja arquivada nao permite bloqueio ou desbloqueio de acesso.
          </EmptyState>
        )}

        {canManageAccessBlock && !isArchived && (
          <div className="grid gap-3 lg:grid-cols-2">
            <StoreAccessBlockDialog
              store={store}
              basePath={basePath}
              disabled={Boolean(activeBlock)}
              disabledReason={
                activeBlock
                  ? 'A loja ja possui bloqueio ativo. Desbloqueie antes de registrar outro.'
                  : undefined
              }
            />
            <StoreAccessUnblockDialog
              store={store}
              basePath={basePath}
              disabled={!activeBlock}
              disabledReason={
                activeBlock
                  ? undefined
                  : 'A loja nao possui bloqueio ativo no momento.'
              }
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StoreAccessBlockDialog({
  store,
  basePath,
  disabled,
  disabledReason,
}: {
  store: InternalStoreOverview
  basePath: string
  disabled: boolean
  disabledReason?: string
}) {
  return (
    <div className="rounded-lg border bg-background/70 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-amber-500/10 p-2 text-amber-600 dark:text-amber-300">
          <ShieldOff className="size-4" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Bloquear acesso</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Impede acesso as areas protegidas da loja ate liberacao manual ou
            data programada.
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
          <Button className="mt-4 w-full" variant="outline" disabled={disabled}>
            <ShieldOff className="size-4" />
            Bloquear acesso
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bloquear acesso da loja</DialogTitle>
            <DialogDescription>
              Use quando o suporte precisar suspender login da loja sem mexer no
              contrato comercial.
            </DialogDescription>
          </DialogHeader>

          <form action={blockStoreAccessAction} className="space-y-5">
            <input type="hidden" name="storeId" value={store.id} />
            <input
              type="hidden"
              name="returnTo"
              value={`${basePath}?tab=dados`}
            />

            <StoreAccessImpactGrid
              changes={['Login dos usuarios da loja', 'Historico de acesso']}
              unchanged={[
                'Status comercial',
                'Assinatura',
                'Plano',
                'Faturas',
                'Pedidos',
              ]}
            />

            <FormField label="Motivo do bloqueio" htmlFor="accessBlockReason">
              <Textarea
                id="accessBlockReason"
                name="reason"
                placeholder="Ex.: suspeita de uso indevido em atendimento de suporte."
                required
              />
            </FormField>

            <label className="flex gap-3 rounded-lg border bg-muted/20 p-4 text-sm">
              <input
                type="checkbox"
                name="notifyStoreOwner"
                className="mt-1 size-4"
              />
              <span>
                <span className="font-medium text-foreground">
                  Notificar responsaveis da loja
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Registra a intencao de enviar aviso sobre o bloqueio.
                </span>
              </span>
            </label>

            <FormField
              label="Desbloqueio automatico em"
              htmlFor="scheduledUnblockAt"
            >
              <Input
                id="scheduledUnblockAt"
                name="scheduledUnblockAt"
                type="datetime-local"
              />
            </FormField>

            <FormField label="Observacao interna" htmlFor="notificationNote">
              <Textarea
                id="notificationNote"
                name="notificationNote"
                placeholder="Ex.: avisar responsavel pelo WhatsApp antes do fim do expediente."
              />
            </FormField>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" variant="outline">
                <ShieldOff className="size-4" />
                Confirmar bloqueio
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StoreAccessUnblockDialog({
  store,
  basePath,
  disabled,
  disabledReason,
}: {
  store: InternalStoreOverview
  basePath: string
  disabled: boolean
  disabledReason?: string
}) {
  return (
    <div className="rounded-lg border bg-background/70 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-md bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-300">
          <KeyRound className="size-4" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Desbloquear acesso</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Libera novamente o login dos usuarios mantendo o historico completo.
          </p>
        </div>
      </div>

      {disabledReason && (
        <p className="mt-3 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          {disabledReason}
        </p>
      )}

      <Dialog>
        <DialogTrigger asChild>
          <Button className="mt-4 w-full" disabled={disabled}>
            <KeyRound className="size-4" />
            Desbloquear acesso
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Desbloquear acesso da loja</DialogTitle>
            <DialogDescription>
              Confirme a justificativa para liberar o acesso protegido desta
              loja.
            </DialogDescription>
          </DialogHeader>

          <form action={unblockStoreAccessAction} className="space-y-5">
            <input type="hidden" name="storeId" value={store.id} />
            <input
              type="hidden"
              name="returnTo"
              value={`${basePath}?tab=dados`}
            />

            <StoreAccessImpactGrid
              changes={['Login dos usuarios da loja', 'Historico de acesso']}
              unchanged={[
                'Status comercial',
                'Assinatura',
                'Plano',
                'Faturas',
                'Pedidos',
              ]}
            />

            <FormField
              label="Motivo do desbloqueio"
              htmlFor="accessUnblockReason"
            >
              <Textarea
                id="accessUnblockReason"
                name="reason"
                placeholder="Ex.: pendencia validada pelo suporte e acesso liberado."
                required
              />
            </FormField>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit">
                <KeyRound className="size-4" />
                Confirmar desbloqueio
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StoreAccessImpactGrid({
  changes,
  unchanged,
}: {
  changes: string[]
  unchanged: string[]
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border bg-emerald-50/60 p-4 text-sm dark:border-emerald-900/70 dark:bg-emerald-950/20">
        <div className="flex items-center gap-2 font-medium text-emerald-900 dark:text-emerald-100">
          <CheckCircle2 className="size-4" />
          Esta acao altera
        </div>
        <ul className="mt-3 space-y-2 text-emerald-800 dark:text-emerald-200">
          {changes.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        <div className="font-medium text-foreground">Nao altera</div>
        <ul className="mt-3 space-y-2 text-muted-foreground">
          {unchanged.map(item => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
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

const invoiceFilterLabels: Record<InternalInvoiceStatusFilter, string> = {
  all: 'Todas',
  open: 'Abertas',
  overdue: 'Vencidas',
  paid: 'Pagas',
  closed: 'Encerradas',
}

const invoiceStatusStyles = {
  open: {
    card: 'border-l-primary bg-primary/5',
    badge:
      'border-primary/30 bg-primary/10 text-primary dark:border-primary/40 dark:bg-primary/15',
  },
  overdue: {
    card: 'border-l-destructive bg-destructive/5',
    badge:
      'border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40 dark:bg-destructive/15 dark:text-rose-200',
  },
  paid: {
    card: 'border-l-emerald-500 bg-emerald-500/5',
    badge:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-200',
  },
  closed: {
    card: 'border-l-muted-foreground bg-muted/30',
    badge:
      'border-muted-foreground/30 bg-muted text-muted-foreground dark:border-muted-foreground/40',
  },
} as const

const getPaymentMethodLabel = (method: string | null) => {
  const labels: Record<string, string> = {
    pix: 'Pix',
    credit_card: 'Cartao',
    boleto: 'Boleto',
    manual: 'Manual',
    external: 'Externo',
  }

  return method ? (labels[method] ?? method) : 'Nao informado'
}

type InternalInvoiceOverview = InternalStoreOverview['invoices'][number]

const getFaturasReturnPath = (
  basePath: string,
  activeFilter: InternalInvoiceStatusFilter
) =>
  activeFilter === 'all'
    ? `${basePath}?tab=faturas`
    : `${basePath}?tab=faturas&invoiceStatus=${activeFilter}`

function CreateManualBillingInvoiceDialog({
  store,
  returnTo,
}: {
  store: InternalStoreOverview
  returnTo: string
}) {
  const currency = store.billing.currency ?? 'BRL'

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" isClickable>
          <CircleDollarSign className="size-4" />
          Cobranca avulsa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Criar cobranca avulsa</DialogTitle>
          <DialogDescription>
            Gere uma fatura manual vinculada a assinatura atual da loja.
          </DialogDescription>
        </DialogHeader>
        <form action={createManualBillingInvoiceAction} className="space-y-5">
          <input type="hidden" name="storeId" value={store.id} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <FormSection title="Cobranca">
            <FormField label={`Valor (${currency})`} htmlFor="manualAmount">
              <Input
                id="manualAmount"
                name="amount"
                inputMode="decimal"
                placeholder="Ex.: 150,00"
                required
              />
            </FormField>
            <FormField label="Vencimento" htmlFor="manualDueAt">
              <Input
                id="manualDueAt"
                name="dueAt"
                type="datetime-local"
                defaultValue={formatDateTimeLocalValue(
                  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                )}
                required
              />
            </FormField>
            <FormField label="Descricao" htmlFor="manualDescription">
              <Input
                id="manualDescription"
                name="description"
                placeholder="Ex.: taxa de implantacao, servico extra..."
                required
              />
            </FormField>
            <FormField label="Motivo/auditoria" htmlFor="manualReason">
              <Textarea
                id="manualReason"
                name="reason"
                placeholder="Explique por que esta cobranca esta sendo criada."
                required
              />
            </FormField>
          </FormSection>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" isClickable>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" isClickable>
              Criar fatura
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RegisterManualPaymentDialog({
  store,
  invoice,
  returnTo,
}: {
  store: InternalStoreOverview
  invoice: InternalInvoiceOverview
  returnTo: string
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" isClickable>
          <CheckCircle2 className="size-4" />
          Pagar manual
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar pagamento manual</DialogTitle>
          <DialogDescription>
            Confirme uma baixa controlada para a fatura {invoice.invoiceNumber}.
          </DialogDescription>
        </DialogHeader>
        <form
          action={markManualBillingInvoicePaymentAction}
          className="space-y-5"
        >
          <input type="hidden" name="storeId" value={store.id} />
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <FormSection title="Pagamento">
            <FormField
              label={`Valor (${invoice.currency})`}
              htmlFor="paymentAmount"
            >
              <Input
                id="paymentAmount"
                name="amount"
                inputMode="decimal"
                defaultValue={invoice.outstandingAmount.toFixed(2)}
                required
              />
            </FormField>
            <FormField label="Pago em" htmlFor="paidAt">
              <Input
                id="paidAt"
                name="paidAt"
                type="datetime-local"
                defaultValue={formatDateTimeLocalValue(new Date())}
                required
              />
            </FormField>
            <FormField label="Referencia opcional" htmlFor="paymentReference">
              <Input
                id="paymentReference"
                name="paymentReference"
                placeholder="Ex.: comprovante, Pix manual, conversa..."
              />
            </FormField>
            <FormField label="Motivo/auditoria" htmlFor="paymentReason">
              <Textarea
                id="paymentReason"
                name="reason"
                placeholder="Explique por que o pagamento sera baixado manualmente."
                required
              />
            </FormField>
          </FormSection>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" isClickable>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" isClickable>
              Registrar pagamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RescheduleInvoiceDueDateDialog({
  store,
  invoice,
  returnTo,
}: {
  store: InternalStoreOverview
  invoice: InternalInvoiceOverview
  returnTo: string
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" isClickable>
          <CalendarClock className="size-4" />
          Vencimento
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Alterar vencimento</DialogTitle>
          <DialogDescription>
            A fatura permanece com o valor original e a alteracao fica no
            historico financeiro.
          </DialogDescription>
        </DialogHeader>
        <form
          action={rescheduleBillingInvoiceDueDateAction}
          className="space-y-5"
        >
          <input type="hidden" name="storeId" value={store.id} />
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <FormSection title="Novo prazo">
            <FormField label="Novo vencimento" htmlFor="rescheduleDueAt">
              <Input
                id="rescheduleDueAt"
                name="dueAt"
                type="datetime-local"
                defaultValue={formatDateTimeLocalValue(invoice.dueAt)}
                required
              />
            </FormField>
            <FormField label="Motivo/auditoria" htmlFor="rescheduleReason">
              <Textarea
                id="rescheduleReason"
                name="reason"
                placeholder="Explique a negociacao ou correcao do vencimento."
                required
              />
            </FormField>
          </FormSection>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" isClickable>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" isClickable>
              Alterar vencimento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AdjustInvoiceAmountDialog({
  store,
  invoice,
  returnTo,
}: {
  store: InternalStoreOverview
  invoice: InternalInvoiceOverview
  returnTo: string
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" isClickable>
          <FilePenLine className="size-4" />
          Ajustar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ajustar valor da fatura</DialogTitle>
          <DialogDescription>
            A acao preserva subtotal original e grava antes/depois no historico.
          </DialogDescription>
        </DialogHeader>
        <form action={adjustBillingInvoiceAmountAction} className="space-y-5">
          <input type="hidden" name="storeId" value={store.id} />
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <FormSection title="Ajuste manual">
            <FormField label="Tipo de ajuste" htmlFor="adjustmentType">
              <select
                id="adjustmentType"
                name="adjustmentType"
                className={selectClassName}
                defaultValue="discount"
                required
              >
                <option value="discount">Desconto</option>
                <option value="surcharge">Acrescimo</option>
              </select>
            </FormField>
            <FormField
              label={`Valor (${invoice.currency})`}
              htmlFor="adjustmentAmount"
            >
              <Input
                id="adjustmentAmount"
                name="amount"
                inputMode="decimal"
                placeholder="Ex.: 25,00"
                required
              />
            </FormField>
            <FormField label="Motivo/auditoria" htmlFor="adjustmentReason">
              <Textarea
                id="adjustmentReason"
                name="reason"
                placeholder="Explique o acordo, correcao ou acrescimo aplicado."
                required
              />
            </FormField>
          </FormSection>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" isClickable>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" isClickable>
              Aplicar ajuste
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function CancelInvoiceDialog({
  store,
  invoice,
  returnTo,
}: {
  store: InternalStoreOverview
  invoice: InternalInvoiceOverview
  returnTo: string
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" isClickable>
          <XCircle className="size-4" />
          Cancelar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cancelar fatura</DialogTitle>
          <DialogDescription>
            Esta acao encerra a fatura {invoice.invoiceNumber} e exige motivo.
          </DialogDescription>
        </DialogHeader>
        <form action={cancelBillingInvoiceAction} className="space-y-5">
          <input type="hidden" name="storeId" value={store.id} />
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <FormSection title="Confirmacao">
            <FormField label="Digite CANCELAR" htmlFor="cancelConfirmation">
              <Input
                id="cancelConfirmation"
                name="confirmation"
                placeholder="CANCELAR"
                required
              />
            </FormField>
            <FormField label="Motivo/auditoria" htmlFor="cancelReason">
              <Textarea
                id="cancelReason"
                name="reason"
                placeholder="Explique por que esta fatura deve ser cancelada."
                required
              />
            </FormField>
          </FormSection>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" isClickable>
                Voltar
              </Button>
            </DialogClose>
            <Button type="submit" variant="destructive" isClickable>
              Cancelar fatura
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RefundInvoiceDialog({
  store,
  invoice,
  returnTo,
}: {
  store: InternalStoreOverview
  invoice: InternalInvoiceOverview
  returnTo: string
}) {
  const refundableAmount = getManualInvoiceRefundableAmount(invoice)

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" isClickable>
          <History className="size-4" />
          Estornar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar estorno</DialogTitle>
          <DialogDescription>
            Registre um estorno controlado para a fatura {invoice.invoiceNumber}
            .
          </DialogDescription>
        </DialogHeader>
        <form action={refundBillingInvoiceAction} className="space-y-5">
          <input type="hidden" name="storeId" value={store.id} />
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <input type="hidden" name="returnTo" value={returnTo} />

          <FormSection title="Estorno">
            <FormField
              label={`Valor (${invoice.currency})`}
              htmlFor="refundAmount"
            >
              <Input
                id="refundAmount"
                name="amount"
                inputMode="decimal"
                defaultValue={refundableAmount.toFixed(2)}
                required
              />
            </FormField>
            <FormField label="Referencia opcional" htmlFor="refundReference">
              <Input
                id="refundReference"
                name="paymentReference"
                placeholder="Ex.: comprovante do estorno"
              />
            </FormField>
            <FormField label="Motivo/auditoria" htmlFor="refundReason">
              <Textarea
                id="refundReason"
                name="reason"
                placeholder="Explique por que o estorno esta sendo registrado."
                required
              />
            </FormField>
          </FormSection>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" isClickable>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" isClickable>
              Registrar estorno
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FaturasTab({
  store,
  operator,
  basePath,
  invoiceStatus,
}: {
  store: InternalStoreOverview
  operator: InternalOperator
  basePath: string
  invoiceStatus?: string
}) {
  const currency = store.billing.currency ?? 'BRL'
  const activeFilter = parseInternalInvoiceStatusFilter(invoiceStatus)
  const canManageBillingInvoices = canRunInternalOperation({
    operator,
    operation: 'manageBillingInvoices',
  })
  const canApplyBillingDiscounts = canRunInternalOperation({
    operator,
    operation: 'applyBillingDiscounts',
  })
  const canCancelBilling = canRunInternalOperation({
    operator,
    operation: 'cancelBilling',
  })
  const returnTo = getFaturasReturnPath(basePath, activeFilter)
  const filterHref = (filter: InternalInvoiceStatusFilter) =>
    filter === 'all'
      ? `${basePath}?tab=faturas`
      : `${basePath}?tab=faturas&invoiceStatus=${filter}`

  return (
    <div className="space-y-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={ReceiptText}
          label="Faturado"
          value={formatCurrency(store.invoiceSummary.totalAmount, currency)}
          detail={`${store.invoiceSummary.totalInvoices} faturas no historico`}
        />
        <SummaryCard
          icon={Clock}
          label="Em aberto"
          value={formatCurrency(store.invoiceSummary.openAmount, currency)}
          detail={`${store.invoiceSummary.openInvoices} aguardando pagamento`}
        />
        <SummaryCard
          icon={ShieldAlert}
          label="Vencidas"
          value={formatCurrency(store.invoiceSummary.overdueAmount, currency)}
          detail={`${store.invoiceSummary.overdueInvoices} exigem acao`}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Pago"
          value={formatCurrency(store.invoiceSummary.paidAmount, currency)}
          detail={`${store.invoiceSummary.paidInvoices} quitadas`}
        />
      </section>

      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Faturas da loja
          </h2>
          <p className="text-sm text-muted-foreground">
            Consulte competencia, vencimento, pagamento, valores e acoes de
            cobranca.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {getInternalInvoiceFilterDescription(activeFilter)}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-wrap gap-2">
            {internalInvoiceStatusFilters.map(filter => (
              <Button
                key={filter}
                asChild
                size="sm"
                variant={activeFilter === filter ? 'default' : 'outline'}
                isClickable
              >
                <Link href={filterHref(filter)}>
                  {invoiceFilterLabels[filter]}
                </Link>
              </Button>
            ))}
          </div>
          {canManageBillingInvoices && (
            <CreateManualBillingInvoiceDialog
              store={store}
              returnTo={returnTo}
            />
          )}
        </div>
      </div>

      {store.invoices.length === 0 ? (
        <EmptyState>
          Nenhuma fatura encontrada para o filtro selecionado.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {store.invoices.map(invoice => {
            const tone = getInternalInvoiceStatusTone(invoice)
            const statusLabel = getInternalInvoiceStatusLabel(invoice)
            const copyAllowed = canCopyInternalInvoicePaymentLink({
              invoice,
              canManageBillingInvoices,
              storeStatus: store.status,
            })
            const canMarkPayment =
              canManageBillingInvoices &&
              canRunManualBillingAction({
                action: 'mark_payment',
                invoice,
              })
            const canReschedule =
              canManageBillingInvoices &&
              canRunManualBillingAction({
                action: 'reschedule_due_date',
                invoice,
              })
            const canAdjust =
              canApplyBillingDiscounts &&
              canRunManualBillingAction({
                action: 'apply_adjustment',
                invoice,
              })
            const canCancelInvoice =
              canCancelBilling &&
              canRunManualBillingAction({
                action: 'cancel_invoice',
                invoice,
              })
            const canRefundInvoice =
              canCancelBilling &&
              canRunManualBillingAction({
                action: 'refund_invoice',
                invoice,
              })

            return (
              <div
                key={invoice.id}
                className={cn(
                  'rounded-lg border border-l-4 bg-card p-4 shadow-xs',
                  invoiceStatusStyles[tone].card
                )}
              >
                <div className="grid gap-4 xl:grid-cols-[1.4fr_1.2fr_1fr_1fr_1.4fr] xl:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-foreground">
                        {invoice.invoiceNumber}
                      </h3>
                      <Badge
                        variant="outline"
                        className={invoiceStatusStyles[tone].badge}
                      >
                        {statusLabel}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Competencia {formatDate(invoice.periodStart)} a{' '}
                      {formatDate(invoice.periodEnd)}
                    </p>
                  </div>

                  <div className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">Vencimento</span>
                    <span className="font-medium text-foreground">
                      {formatDate(invoice.dueAt)}
                    </span>
                  </div>

                  <div className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">Pagamento</span>
                    <span className="font-medium text-foreground">
                      {invoice.paidAt
                        ? formatDate(invoice.paidAt)
                        : getPaymentMethodLabel(invoice.paymentMethod)}
                    </span>
                  </div>

                  <div className="grid gap-1 text-sm">
                    <span className="text-muted-foreground">Saldo</span>
                    <span className="font-semibold text-foreground">
                      {formatCurrency(
                        invoice.outstandingAmount,
                        invoice.currency
                      )}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" isClickable>
                          <Eye className="size-4" />
                          Detalhes
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>
                            Fatura {invoice.invoiceNumber}
                          </DialogTitle>
                          <DialogDescription>
                            Detalhes financeiros, competencia e forma de
                            pagamento registrada.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-3 md:grid-cols-2">
                          <DetailField label="Status" value={statusLabel} />
                          <DetailField
                            label="Forma"
                            value={getPaymentMethodLabel(invoice.paymentMethod)}
                          />
                          <DetailField
                            label="Competencia"
                            value={`${formatDate(invoice.periodStart)} a ${formatDate(invoice.periodEnd)}`}
                          />
                          <DetailField
                            label="Vencimento"
                            value={formatDate(invoice.dueAt)}
                          />
                          <DetailField
                            label="Subtotal"
                            value={formatCurrency(
                              invoice.subtotalAmount,
                              invoice.currency
                            )}
                          />
                          <DetailField
                            label="Desconto"
                            value={formatCurrency(
                              invoice.discountAmount,
                              invoice.currency
                            )}
                          />
                          <DetailField
                            label="Total"
                            value={formatCurrency(
                              invoice.totalAmount,
                              invoice.currency
                            )}
                          />
                          <DetailField
                            label="Pago"
                            value={formatCurrency(
                              invoice.amountPaid,
                              invoice.currency
                            )}
                          />
                          <DetailField
                            label="Reembolsado"
                            value={formatCurrency(
                              invoice.amountRefunded,
                              invoice.currency
                            )}
                          />
                          <DetailField
                            label="Saldo"
                            value={formatCurrency(
                              invoice.outstandingAmount,
                              invoice.currency
                            )}
                          />
                        </div>
                        <DialogFooter>
                          <CopyInvoicePaymentLinkButton
                            paymentLink={invoice.paymentLink}
                            disabled={!copyAllowed}
                            disabledReason="Disponivel apenas para faturas abertas ou vencidas com link e permissao financeira."
                          />
                          <DialogClose asChild>
                            <Button variant="outline" isClickable>
                              Fechar
                            </Button>
                          </DialogClose>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <CopyInvoicePaymentLinkButton
                      paymentLink={invoice.paymentLink}
                      disabled={!copyAllowed}
                      disabledReason="Disponivel apenas para faturas abertas ou vencidas com link e permissao financeira."
                    />
                    {canMarkPayment && (
                      <RegisterManualPaymentDialog
                        store={store}
                        invoice={invoice}
                        returnTo={returnTo}
                      />
                    )}
                    {canReschedule && (
                      <RescheduleInvoiceDueDateDialog
                        store={store}
                        invoice={invoice}
                        returnTo={returnTo}
                      />
                    )}
                    {canAdjust && (
                      <AdjustInvoiceAmountDialog
                        store={store}
                        invoice={invoice}
                        returnTo={returnTo}
                      />
                    )}
                    {canCancelInvoice && (
                      <CancelInvoiceDialog
                        store={store}
                        invoice={invoice}
                        returnTo={returnTo}
                      />
                    )}
                    {canRefundInvoice && (
                      <RefundInvoiceDialog
                        store={store}
                        invoice={invoice}
                        returnTo={returnTo}
                      />
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-2 border-t pt-3 text-sm md:grid-cols-4">
                  <span className="text-muted-foreground">
                    Total:{' '}
                    <strong className="text-foreground">
                      {formatCurrency(invoice.totalAmount, invoice.currency)}
                    </strong>
                  </span>
                  <span className="text-muted-foreground">
                    Pago:{' '}
                    <strong className="text-foreground">
                      {formatCurrency(invoice.amountPaid, invoice.currency)}
                    </strong>
                  </span>
                  <span className="text-muted-foreground">
                    Provedor:{' '}
                    <strong className="text-foreground">
                      {invoice.paymentProvider ?? 'Nao informado'}
                    </strong>
                  </span>
                  <span className="text-muted-foreground">
                    Criada:{' '}
                    <strong className="text-foreground">
                      {formatDate(invoice.createdAt)}
                    </strong>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PlanoTab({
  store,
  operator,
  basePath,
  billingPlans,
}: {
  store: InternalStoreOverview
  operator: InternalOperator
  basePath: string
  billingPlans: InternalBillingPlanOption[]
}) {
  const currency = store.billing.currency ?? 'BRL'
  const planCurrency = store.billing.planCurrency ?? currency
  const expectedBlockAt =
    store.billing.expectedBlockAt ??
    getExpectedSubscriptionBlockAt({
      nextBillingAt: store.billing.nextBillingAt,
      paymentGraceDays: store.billing.paymentGraceDays,
    })
  const billingIntervalLabel = getBillingIntervalLabel({
    billingInterval: store.billing.billingInterval,
    billingIntervalCount: store.billing.billingIntervalCount,
  })
  const planIntervalLabel = getBillingIntervalLabel({
    billingInterval:
      store.billing.planBillingInterval ?? store.billing.billingInterval,
    billingIntervalCount:
      store.billing.planBillingIntervalCount ??
      store.billing.billingIntervalCount,
  })
  const canManageFinancialValues = canRunInternalOperation({
    operator,
    operation: 'manageBillingValues',
  })
  const canApplyBillingDiscounts = canRunInternalOperation({
    operator,
    operation: 'applyBillingDiscounts',
  })
  const canEditTerms =
    (canManageFinancialValues || canApplyBillingDiscounts) &&
    store.status !== 'archived' &&
    Boolean(store.billing.subscriptionId)
  const canChangePlan =
    canManageFinancialValues &&
    store.status !== 'archived' &&
    Boolean(store.billing.subscriptionId)
  const availableTargetPlans = billingPlans.filter(
    plan => plan.id !== store.billing.planId
  )

  if (!store.billing.subscriptionId) {
    return (
      <EmptyState>
        Esta loja ainda nao possui assinatura ativa para gerenciamento.
      </EmptyState>
    )
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden rounded-lg py-0 shadow-xs hover:shadow-xs">
        <div className="border-b bg-muted/30 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Plano contratado</Badge>
                <Badge variant="outline">
                  {store.billing.subscriptionStatus ?? 'sem assinatura'}
                </Badge>
                <Badge variant="outline">{billingIntervalLabel}</Badge>
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-foreground">
                  {store.billing.planName ?? 'Plano sem nome'}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Codigo {store.billing.planCode ?? 'nao informado'} com
                  condicao individual preservada para esta loja.
                </p>
              </div>
            </div>
            <div className="space-y-3 rounded-lg border bg-background p-4 text-left lg:min-w-[280px]">
              <div className="text-xs font-medium text-muted-foreground">
                Valor contratado da loja
              </div>
              <div className="mt-1 text-2xl font-semibold text-foreground">
                {formatCurrency(store.billing.contractedAmount, currency)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                Catalogo:{' '}
                {formatCurrency(store.billing.planDefaultAmount, planCurrency)}
              </div>
              {canChangePlan ? (
                <ChangeSubscriptionPlanDialog
                  store={store}
                  basePath={basePath}
                  billingPlans={availableTargetPlans}
                />
              ) : (
                <Button variant="outline" disabled className="w-full">
                  <Layers3 className="size-4" />
                  Mudar plano
                </Button>
              )}
            </div>
          </div>
        </div>
        <CardContent className="space-y-4 p-5">
          {store.pendingPlanChange && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold">
                    Mudanca programada para {store.pendingPlanChange.toPlanName}
                  </div>
                  <div className="mt-1">
                    Vigencia em{' '}
                    {formatDate(store.pendingPlanChange.effectiveAt)}, valor{' '}
                    {formatCurrency(
                      store.pendingPlanChange.nextContractedAmount,
                      store.pendingPlanChange.currency
                    )}
                    .
                  </div>
                  {store.pendingPlanChange.proration && (
                    <div className="mt-1 text-xs">
                      Pro-rata:{' '}
                      {getProrationAdjustmentLabel(
                        getProrationString(
                          store.pendingPlanChange.proration,
                          'adjustmentType'
                        )
                      )}{' '}
                      de{' '}
                      {formatCurrency(
                        getProrationString(
                          store.pendingPlanChange.proration,
                          'amount'
                        ) || '0',
                        store.pendingPlanChange.currency
                      )}
                      .
                    </div>
                  )}
                </div>
                <Badge variant="outline">
                  {getModuleTreatmentLabel(
                    store.pendingPlanChange.moduleTreatment as
                      | 'sync_to_new_plan'
                      | 'keep_current'
                      | 'manual_review'
                  )}
                </Badge>
              </div>
            </div>
          )}
          {store.billingAdjustments.length > 0 && (
            <div className="rounded-lg border bg-background/70 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">
                    Ajustes de pro-rata
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Memoria financeira gerada em mudancas de plano.
                  </p>
                </div>
                <Badge variant="outline">
                  {store.billingAdjustments.length} registro(s)
                </Badge>
              </div>
              <div className="mt-4 space-y-3">
                {store.billingAdjustments.map(adjustment => {
                  const remainingDays = getProrationNumber(
                    adjustment.calculationSnapshot,
                    'remainingDays'
                  )
                  const formula = getProrationString(
                    adjustment.calculationSnapshot,
                    'formula'
                  )

                  return (
                    <div
                      key={adjustment.id}
                      className="rounded-md border bg-muted/20 p-3 text-sm"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="font-medium text-foreground">
                            {getProrationAdjustmentLabel(
                              adjustment.adjustmentType
                            )}{' '}
                            -{' '}
                            {formatCurrency(
                              adjustment.amount,
                              adjustment.currency
                            )}
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            Competencia de{' '}
                            {formatDate(adjustment.competenceStart)} ate{' '}
                            {formatDate(adjustment.competenceEnd)}.
                          </div>
                        </div>
                        <Badge variant="outline">
                          {getProrationStatusLabel(adjustment.status)}
                        </Badge>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                        <span>
                          Dias restantes:{' '}
                          <strong className="text-foreground">
                            {remainingDays}
                          </strong>
                        </span>
                        <span>
                          Plano anterior:{' '}
                          <strong className="text-foreground">
                            {formatCurrency(
                              getProrationString(
                                adjustment.calculationSnapshot,
                                'currentContractedAmount'
                              ) || '0',
                              adjustment.currency
                            )}
                          </strong>
                        </span>
                        <span>
                          Novo plano:{' '}
                          <strong className="text-foreground">
                            {formatCurrency(
                              getProrationString(
                                adjustment.calculationSnapshot,
                                'nextContractedAmount'
                              ) || '0',
                              adjustment.currency
                            )}
                          </strong>
                        </span>
                      </div>
                      {formula && (
                        <div className="mt-2 rounded-md border bg-background/70 p-2 text-xs text-muted-foreground">
                          {formula}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-3">
            <DetailField
              label="Periodicidade contratada"
              value={billingIntervalLabel}
            />
            <DetailField
              label="Proxima cobranca"
              value={formatDate(store.billing.nextBillingAt)}
            />
            <DetailField
              label="Periodo atual"
              value={`${formatDate(store.billing.currentPeriodStart)} ate ${formatDate(store.billing.currentPeriodEnd)}`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <PlanTermsCard
              icon={CircleDollarSign}
              title="Resumo do contrato"
              items={[
                [
                  'Plano do catalogo',
                  store.billing.planName ?? 'Nao informado',
                ],
                [
                  'Valor padrao',
                  formatCurrency(store.billing.planDefaultAmount, planCurrency),
                ],
                ['Periodicidade do catalogo', planIntervalLabel],
                ['Trial do plano', `${store.billing.trialDays ?? 0} dias`],
              ]}
            />
            <PlanTermsCard
              icon={FilePenLine}
              title="Condicao especifica da loja"
              items={[
                [
                  'Valor contratado',
                  formatCurrency(store.billing.contractedAmount, currency),
                ],
                [
                  'Desconto',
                  getDiscountLabel({
                    discountType: store.billing.discountType,
                    discountValue: store.billing.discountValue,
                    currency,
                  }),
                ],
                [
                  'Validade do desconto',
                  formatDate(store.billing.discountValidUntil),
                ],
                ['Catalogo alterado', 'Nao'],
              ]}
            />
            <PlanTermsCard
              icon={CalendarClock}
              title="Risco de bloqueio"
              items={[
                ['Tolerancia', `${store.billing.paymentGraceDays} dias`],
                ['Bloqueio previsto', formatDate(expectedBlockAt)],
                ['Base do calculo', formatDate(store.billing.nextBillingAt)],
                [
                  'Acesso atual',
                  store.accessBlock?.isActive ? 'Bloqueado' : 'Liberado',
                ],
              ]}
            />
          </div>

          <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="font-semibold text-foreground">
                Editar condicao especifica
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Altera a assinatura desta loja sem mudar o catalogo de planos.
              </p>
            </div>
            {canEditTerms ? (
              <SubscriptionTermsDialog
                store={store}
                basePath={basePath}
                canManageFinancialValues={canManageFinancialValues}
              />
            ) : (
              <Button variant="outline" disabled>
                <Pencil className="size-4" />
                Editar condicao
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PlanTermsCard({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof Store
  title: string
  items: [string, string][]
}) {
  return (
    <div className="rounded-lg border bg-background/70 p-4">
      <div className="flex items-center gap-2 font-semibold text-foreground">
        <Icon className="size-4 text-primary" />
        {title}
      </div>
      <div className="mt-4 space-y-3">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="max-w-[55%] text-right text-sm font-medium text-foreground">
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChangeSubscriptionPlanDialog({
  store,
  basePath,
  billingPlans,
}: {
  store: InternalStoreOverview
  basePath: string
  billingPlans: InternalBillingPlanOption[]
}) {
  const currency = store.billing.currency ?? 'BRL'
  const currentAmount = store.billing.contractedAmount ?? ''
  const currentPlanLabel = `${store.billing.planName ?? 'Plano atual'} (${store.billing.planCode ?? 'sem codigo'})`
  const nextBillingLabel = formatDate(store.billing.nextBillingAt)
  const currentModulePreviewItems = store.modules.map(module => ({
    moduleId: module.moduleId,
    name: module.name,
    origin: module.origin,
    status: module.status,
  }))

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="w-full">
          <Layers3 className="size-4" />
          Mudar plano
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Mudar plano da loja</DialogTitle>
          <DialogDescription>
            Escolha se a troca entra agora ou apenas na proxima renovacao da
            assinatura.
          </DialogDescription>
        </DialogHeader>

        <form action={changeStoreSubscriptionPlanAction} className="space-y-5">
          <input type="hidden" name="storeId" value={store.id} />
          <input
            type="hidden"
            name="subscriptionId"
            value={store.billing.subscriptionId ?? ''}
          />
          <input
            type="hidden"
            name="returnTo"
            value={`${basePath}?tab=plano`}
          />

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-sm font-semibold text-foreground">
                Plano atual
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Plano</span>
                  <span className="text-right font-medium">
                    {currentPlanLabel}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Valor</span>
                  <span className="font-medium">
                    {formatCurrency(currentAmount, currency)}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">
                    Proxima cobranca
                  </span>
                  <span className="font-medium">{nextBillingLabel}</span>
                </div>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-sm font-semibold text-foreground">
                Previa financeira
              </div>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <p>
                  Aplicar agora calcula pro-rata entre hoje e o fim do ciclo
                  atual. Aplicar na renovacao registra ajuste zero.
                </p>
                <div className="rounded-md border bg-background/70 p-3 text-xs">
                  Formula: (novo valor - valor atual) proporcional aos dias
                  restantes do ciclo.
                </div>
                <p>
                  A memoria real fica salva no historico financeiro ao confirmar
                  a mudanca.
                </p>
              </div>
            </div>
          </div>

          {store.pendingPlanChange && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
              Esta assinatura ja possui uma mudanca programada para{' '}
              {formatDate(store.pendingPlanChange.effectiveAt)}. Remova ou
              conclua essa pendencia antes de criar outra.
            </div>
          )}

          <FormSection title="Novo plano e vigencia">
            <SubscriptionPlanModuleImpactPreview
              plans={billingPlans}
              currentModules={currentModulePreviewItems}
              disabled={billingPlans.length === 0 || !!store.pendingPlanChange}
            />
            <FormField label="Quando aplicar" htmlFor="timing">
              <select
                id="timing"
                name="timing"
                className={selectClassName}
                defaultValue="next_renewal"
                disabled={!!store.pendingPlanChange}
                required
              >
                <option value="next_renewal">
                  {getPlanChangeTimingLabel('next_renewal')} ({nextBillingLabel}
                  )
                </option>
                <option value="immediate">
                  {getPlanChangeTimingLabel('immediate')}
                </option>
              </select>
            </FormField>
          </FormSection>

          <FormSection title="Valor e ajuste">
            <FormField label="Valor contratado" htmlFor="valueMode">
              <select
                id="valueMode"
                name="valueMode"
                className={selectClassName}
                defaultValue="keep_current"
                disabled={!!store.pendingPlanChange}
                required
              >
                <option value="keep_current">Manter valor atual da loja</option>
                <option value="use_plan_default">
                  Usar valor padrao do novo plano
                </option>
                <option value="custom">Definir novo valor personalizado</option>
              </select>
            </FormField>
            <FormField
              label={`Novo valor personalizado (${currency})`}
              htmlFor="customContractedAmount"
            >
              <Input
                id="customContractedAmount"
                name="customContractedAmount"
                inputMode="decimal"
                placeholder="Ex.: 249,90"
                disabled={!!store.pendingPlanChange}
              />
            </FormField>
            <FormField label="Ajuste proporcional" htmlFor="prorationPolicy">
              <select
                id="prorationPolicy"
                name="prorationPolicy"
                className={selectClassName}
                defaultValue="create_adjustment"
                disabled={!!store.pendingPlanChange}
                required
              >
                <option value="create_adjustment">
                  {getProrationPolicyLabel('create_adjustment')}
                </option>
                <option value="record_only">
                  {getProrationPolicyLabel('record_only')}
                </option>
                <option value="waive">
                  {getProrationPolicyLabel('waive')}
                </option>
              </select>
            </FormField>
            <FormField label="Motivo da alteracao" htmlFor="planChangeReason">
              <Textarea
                id="planChangeReason"
                name="reason"
                placeholder="Ex.: upgrade solicitado pelo cliente para liberar mais modulos."
                disabled={!!store.pendingPlanChange}
                required
              />
            </FormField>
          </FormSection>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={billingPlans.length === 0 || !!store.pendingPlanChange}
            >
              <CheckCircle2 className="size-4" />
              Confirmar mudanca
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function SubscriptionTermsDialog({
  store,
  basePath,
  canManageFinancialValues,
}: {
  store: InternalStoreOverview
  basePath: string
  canManageFinancialValues: boolean
}) {
  const currency = store.billing.currency ?? 'BRL'
  const contractedAmount = store.billing.contractedAmount ?? ''
  const paymentGraceDays = store.billing.paymentGraceDays

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Pencil className="size-4" />
          Editar condicao
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Editar condicao desta loja</DialogTitle>
          <DialogDescription>
            Atualize a negociacao vigente sem alterar o plano no catalogo.
          </DialogDescription>
        </DialogHeader>

        <form action={updateStoreSubscriptionTermsAction} className="space-y-5">
          <input type="hidden" name="storeId" value={store.id} />
          <input
            type="hidden"
            name="subscriptionId"
            value={store.billing.subscriptionId ?? ''}
          />
          <input
            type="hidden"
            name="returnTo"
            value={`${basePath}?tab=plano`}
          />

          <StoreAccessImpactGrid
            changes={[
              'Valor contratado desta loja',
              'Desconto e validade',
              'Tolerancia e bloqueio previsto',
              'Auditoria financeira',
            ]}
            unchanged={[
              'Catalogo de planos',
              'Modulos do plano',
              'Faturas historicas',
              'Status comercial da loja',
            ]}
          />

          <FormSection title="Contrato da loja">
            <FormField
              label={`Valor contratado (${currency})`}
              htmlFor="contractedAmount"
            >
              <Input
                id="contractedAmount"
                name="contractedAmount"
                inputMode="decimal"
                defaultValue={contractedAmount}
                disabled={!canManageFinancialValues}
                required
              />
              {!canManageFinancialValues && (
                <input
                  type="hidden"
                  name="contractedAmount"
                  value={contractedAmount}
                />
              )}
            </FormField>
            <FormField
              label="Tolerancia apos vencimento"
              htmlFor="paymentGraceDays"
            >
              <Input
                id="paymentGraceDays"
                name="paymentGraceDays"
                type="number"
                min={0}
                max={90}
                defaultValue={paymentGraceDays}
                disabled={!canManageFinancialValues}
                required
              />
              {!canManageFinancialValues && (
                <input
                  type="hidden"
                  name="paymentGraceDays"
                  value={paymentGraceDays}
                />
              )}
            </FormField>
          </FormSection>

          {!canManageFinancialValues && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
              Seu perfil pode ajustar desconto comercial, mas valor contratado e
              tolerancia ficam travados para o financeiro.
            </div>
          )}

          <FormSection title="Desconto negociado">
            <FormField label="Tipo de desconto" htmlFor="discountType">
              <select
                id="discountType"
                name="discountType"
                className={selectClassName}
                defaultValue={store.billing.discountType ?? 'none'}
              >
                <option value="none">Sem desconto</option>
                <option value="percentage">Percentual</option>
                <option value="fixed_amount">Valor fixo</option>
              </select>
            </FormField>
            <FormField label="Valor do desconto" htmlFor="discountValue">
              <Input
                id="discountValue"
                name="discountValue"
                inputMode="decimal"
                defaultValue={store.billing.discountValue ?? ''}
                placeholder="Ex.: 10 ou 50,00"
              />
            </FormField>
            <FormField
              label="Validade do desconto"
              htmlFor="discountValidUntil"
            >
              <Input
                id="discountValidUntil"
                name="discountValidUntil"
                type="datetime-local"
                defaultValue={formatDateTimeLocalValue(
                  store.billing.discountValidUntil
                )}
              />
            </FormField>
            <FormField label="Motivo da alteracao" htmlFor="reason">
              <Textarea
                id="reason"
                name="reason"
                placeholder="Ex.: condicao negociada na renovacao comercial."
                required
              />
            </FormField>
          </FormSection>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit">
              <CheckCircle2 className="size-4" />
              Salvar condicao
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ModulosTab({
  store,
  operator,
  basePath,
}: {
  store: InternalStoreOverview
  operator: InternalOperator
  basePath: string
}) {
  if (store.modules.length === 0) {
    return <EmptyState>Nenhum modulo cadastrado no catalogo.</EmptyState>
  }

  const canManageModules = canRunInternalOperation({
    operator,
    operation: 'manageStoreModules',
  })
  const activeModules = store.modules.filter(
    module => module.status === 'active'
  )
  const planModules = activeModules.filter(module => module.origin === 'plan')
  const paidModules = activeModules.filter(module => module.isAdditional)
  const exceptionModules = activeModules.filter(module =>
    ['courtesy', 'manual'].includes(module.origin ?? '')
  )
  const inactiveModules = store.modules.filter(
    module => module.status !== 'active'
  )

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard
          icon={Layers3}
          label="Modulos ativos"
          value={String(activeModules.length)}
          detail={`${planModules.length} pelo plano atual`}
        />
        <SummaryCard
          icon={CircleDollarSign}
          label="Adicionais"
          value={String(paidModules.length)}
          detail="Liberacoes com valor proprio"
        />
        <SummaryCard
          icon={ShieldAlert}
          label="Excecoes"
          value={String(exceptionModules.length)}
          detail="Cortesia ou liberacao manual"
        />
        <SummaryCard
          icon={PowerOff}
          label="Nao ativos"
          value={String(inactiveModules.length)}
          detail="Disponiveis ou historicos"
        />
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-foreground">
                Catalogo de modulos da loja
              </h3>
              <p className="text-sm text-muted-foreground">
                Ative excecoes, acompanhe vigencia e preserve o historico de
                liberacoes.
              </p>
            </div>
            {!canManageModules && (
              <Badge variant="outline">
                <LockKeyhole className="mr-1 size-3" />
                Somente leitura
              </Badge>
            )}
          </div>
        </div>
        <div className="divide-y">
          {store.modules.map(module => {
            const isActive = module.status === 'active'
            const valueLabel = module.isAdditional
              ? formatCurrency(module.additionalAmount, module.currency)
              : module.origin === 'plan'
                ? 'Incluido no plano'
                : module.origin
                  ? 'Sem cobranca'
                  : 'Nao contratado'
            const periodLabel = module.startsAt
              ? `${formatDate(module.startsAt)} ate ${
                  module.endsAt ? formatDate(module.endsAt) : 'sem fim'
                }`
              : 'Sem vigencia'

            return (
              <div
                key={module.moduleId}
                className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.4fr)_0.8fr_0.8fr_0.8fr_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-medium text-foreground">
                      {module.name}
                    </h4>
                    <Badge variant={isActive ? 'default' : 'outline'}>
                      {module.statusLabel}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {module.description || module.code}
                  </p>
                  <div className="mt-2 text-xs text-muted-foreground">
                    Codigo: <span className="font-mono">{module.code}</span>
                    {module.historyCount > 0 && (
                      <span>
                        {' '}
                        - {module.historyCount} registro(s) historico(s)
                      </span>
                    )}
                  </div>
                </div>
                <DetailField label="Origem" value={module.originLabel} />
                <DetailField label="Valor" value={valueLabel} />
                <DetailField label="Vigencia" value={periodLabel} />
                <div className="flex flex-col gap-2 lg:items-end">
                  {canManageModules && module.canActivate && (
                    <ActivateModuleDialog
                      module={module}
                      storeId={store.id}
                      basePath={basePath}
                    />
                  )}
                  {canManageModules && module.canDeactivate && (
                    <DeactivateModuleDialog
                      module={module}
                      storeId={store.id}
                      basePath={basePath}
                    />
                  )}
                  {canManageModules &&
                    !module.canActivate &&
                    !module.canDeactivate &&
                    module.deactivateBlockedReason && (
                      <p className="max-w-48 text-right text-xs text-muted-foreground">
                        {module.deactivateBlockedReason}
                      </p>
                    )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ActivateModuleDialog({
  module,
  storeId,
  basePath,
}: {
  module: InternalStoreOverview['modules'][number]
  storeId: number
  basePath: string
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Power className="size-4" />
          Ativar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Ativar modulo {module.name}</DialogTitle>
          <DialogDescription>
            Libere o modulo como adicional, cortesia ou excecao manual para esta
            loja.
          </DialogDescription>
        </DialogHeader>
        <form action={manageStoreModuleEntitlementAction} className="space-y-4">
          <input
            type="hidden"
            name="returnTo"
            value={`${basePath}?tab=modulos`}
          />
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="moduleId" value={module.moduleId} />
          <input type="hidden" name="action" value="activate" />
          <FormSection title="Liberacao">
            <FormField
              label="Origem"
              htmlFor={`module-${module.moduleId}-origin`}
            >
              <select
                id={`module-${module.moduleId}-origin`}
                name="origin"
                className={selectClassName}
                defaultValue="manual"
              >
                <option value="manual">
                  {getModuleEntitlementOriginLabel('manual')}
                </option>
                <option value="courtesy">
                  {getModuleEntitlementOriginLabel('courtesy')}
                </option>
                <option value="addon">
                  {getModuleEntitlementOriginLabel('addon')}
                </option>
              </select>
            </FormField>
            <FormField
              label="Valor adicional"
              htmlFor={`module-${module.moduleId}-amount`}
            >
              <Input
                id={`module-${module.moduleId}-amount`}
                name="additionalAmount"
                inputMode="decimal"
                placeholder="Obrigatorio apenas para adicional"
              />
            </FormField>
            <FormField
              label="Fim da vigencia da cortesia"
              htmlFor={`module-${module.moduleId}-ends-at`}
            >
              <Input
                id={`module-${module.moduleId}-ends-at`}
                name="endsAt"
                type="datetime-local"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Obrigatorio para cortesia. Adicionais e liberacoes manuais podem
                ficar sem data final quando aprovados pela operacao.
              </p>
            </FormField>
            <FormField
              label="Motivo da liberacao"
              htmlFor={`module-${module.moduleId}-reason`}
            >
              <Textarea
                id={`module-${module.moduleId}-reason`}
                name="reason"
                placeholder="Ex.: modulo liberado como cortesia comercial."
                required
              />
            </FormField>
          </FormSection>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit">
              <CheckCircle2 className="size-4" />
              Ativar modulo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeactivateModuleDialog({
  module,
  storeId,
  basePath,
}: {
  module: InternalStoreOverview['modules'][number]
  storeId: number
  basePath: string
}) {
  const formId = `deactivate-module-${module.moduleId}`

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="destructive">
          <PowerOff className="size-4" />
          Desativar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desativar modulo {module.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            A loja pode perder acesso imediato aos recursos ligados a este
            modulo. O registro historico sera preservado como revogado.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-lg border bg-muted/20 p-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <DetailField label="Origem" value={module.originLabel} />
            <DetailField
              label="Valor"
              value={
                module.isAdditional
                  ? formatCurrency(module.additionalAmount, module.currency)
                  : 'Sem cobranca'
              }
            />
            <DetailField label="Desde" value={formatDate(module.startsAt)} />
            <DetailField
              label="Vigencia"
              value={module.endsAt ? formatDate(module.endsAt) : 'Sem fim'}
            />
          </div>
        </div>
        <form
          id={formId}
          action={manageStoreModuleEntitlementAction}
          className="space-y-3"
        >
          <input
            type="hidden"
            name="returnTo"
            value={`${basePath}?tab=modulos`}
          />
          <input type="hidden" name="storeId" value={storeId} />
          <input type="hidden" name="moduleId" value={module.moduleId} />
          <input
            type="hidden"
            name="entitlementId"
            value={module.entitlementId ?? ''}
          />
          <input type="hidden" name="action" value="deactivate" />
          <FormField label="Motivo da desativacao" htmlFor={`${formId}-reason`}>
            <Textarea
              id={`${formId}-reason`}
              name="reason"
              placeholder="Ex.: cliente cancelou o adicional."
              required
            />
          </FormField>
          <FormField label="Confirmacao" htmlFor={`${formId}-confirmation`}>
            <Input
              id={`${formId}-confirmation`}
              name="confirmation"
              placeholder="Digite DESATIVAR"
              required
            />
          </FormField>
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button type="submit" form={formId} variant="destructive">
              Desativar modulo
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
        value={formatCurrency(
          store.metrics.grossRevenue,
          store.billing.currency ?? 'BRL'
        )}
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

function TableLike({ headers, rows }: { headers: string[]; rows: string[][] }) {
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
