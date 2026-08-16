import {
  canUseInternalPermission,
  type InternalOperator,
} from '@/features/internal-operations/access'
import {
  InternalStoresTable,
  type SerializableInternalStoreListItem,
} from '@/features/internal-operations/components/internal-stores-table'
import {
  getInternalStoreDashboardIndicators,
  getRecentInternalAuditLogs,
  listActiveBillingPlansForInternalCreation,
  listInternalStores,
  listInternalStoreCityFilterOptions,
  parseInternalStoreAccessFilter,
  parseInternalStoreDateFilter,
  parseInternalStorePositiveInteger,
  parseStoreStatus,
  type InternalStoreAccessFilter,
  type InternalStoreStatus,
} from '@/features/internal-operations/db'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/card'
import { Input } from '@/shared/input'
import { CircleDollarSign, KeyRound, Plus, Search, Store } from 'lucide-react'
import Link from 'next/link'

type InternalStoresPanelProps = {
  operator: InternalOperator
  searchParams: {
    status?: string
    q?: string
    planId?: string
    access?: string
    city?: string
    createdFrom?: string
    createdTo?: string
    page?: string
    result?: string
    error?: string
  }
  basePath: string
}

const statusTabs: { value?: InternalStoreStatus; label: string }[] = [
  { label: 'Todas' },
  { value: 'implementing', label: 'Em implantacao' },
  { value: 'active', label: 'Ativas' },
  { value: 'pending_recovery', label: 'Pendentes' },
  { value: 'inactive', label: 'Inativas' },
  { value: 'archived', label: 'Arquivadas' },
]

const resultMessages: Record<string, string> = {
  'loja-reativada': 'Loja reativada e administrador vinculado com sucesso.',
  'loja-arquivada': 'Loja arquivada e acessos ativos revogados com sucesso.',
  'loja-cadastrada':
    'Loja cadastrada com responsavel, plano e modulos com sucesso.',
  'checklist-atualizado': 'Checklist de implantacao atualizado com sucesso.',
  'loja-ativada': 'Loja ativada comercialmente com sucesso.',
}

const formatDateTime = (date: Date | string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)

const formatInteger = (value: number) =>
  new Intl.NumberFormat('pt-BR').format(value)

const auditActionLabels: Record<string, string> = {
  create_store: 'Cadastro',
  update_store_implementation_checklist: 'Checklist',
  activate_store_after_implementation: 'Ativacao',
  reactivate_store: 'Reativacao',
  archive_store: 'Arquivamento',
}

type InternalStorePanelFilters = {
  status?: InternalStoreStatus
  search?: string
  planId?: number
  access?: InternalStoreAccessFilter
  city?: string
  createdFromRaw?: string
  createdToRaw?: string
  page?: number
}

const buildStoresHref = ({
  basePath,
  filters,
  overrides = {},
}: {
  basePath: string
  filters: InternalStorePanelFilters
  overrides?: Partial<InternalStorePanelFilters>
}) => {
  const nextFilters = { ...filters, ...overrides }
  const params = new URLSearchParams()
  if (nextFilters.status) params.set('status', nextFilters.status)
  if (nextFilters.search) params.set('q', nextFilters.search)
  if (nextFilters.planId) params.set('planId', String(nextFilters.planId))
  if (nextFilters.access) params.set('access', nextFilters.access)
  if (nextFilters.city) params.set('city', nextFilters.city)
  if (nextFilters.createdFromRaw) {
    params.set('createdFrom', nextFilters.createdFromRaw)
  }
  if (nextFilters.createdToRaw) {
    params.set('createdTo', nextFilters.createdToRaw)
  }
  if (nextFilters.page && nextFilters.page > 1) {
    params.set('page', String(nextFilters.page))
  }

  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}

const serializeStoresForClient = (
  stores: Awaited<ReturnType<typeof listInternalStores>>['items']
): SerializableInternalStoreListItem[] =>
  stores.map(store => ({
    ...store,
    statusUpdatedAt: store.statusUpdatedAt.toISOString(),
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
    billing: {
      ...store.billing,
      nextBillingAt: store.billing.nextBillingAt?.toISOString() ?? null,
    },
    admins: store.admins.map(admin => ({
      ...admin,
      revokedAt: admin.revokedAt?.toISOString() ?? null,
    })),
    implementationChecklist: {
      progress: store.implementationChecklist.progress,
      items: store.implementationChecklist.items.map(item => ({
        ...item,
        completedAt: item.completedAt?.toISOString() ?? null,
        updatedAt: item.updatedAt.toISOString(),
      })),
    },
  }))

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  return 'Erro desconhecido'
}

export async function InternalStoresPanel({
  operator,
  searchParams,
  basePath,
}: InternalStoresPanelProps) {
  const status = parseStoreStatus(searchParams.status)
  const search = searchParams.q?.trim() ?? ''
  const planId = parseInternalStorePositiveInteger(searchParams.planId)
  const access = parseInternalStoreAccessFilter(searchParams.access)
  const city = searchParams.city?.trim() ?? ''
  const createdFrom = parseInternalStoreDateFilter(
    searchParams.createdFrom,
    'start'
  )
  const createdTo = parseInternalStoreDateFilter(searchParams.createdTo, 'end')
  const page = parseInternalStorePositiveInteger(searchParams.page) ?? 1
  const filters: InternalStorePanelFilters = {
    status,
    search,
    planId,
    access,
    city,
    createdFromRaw: createdFrom ? searchParams.createdFrom : undefined,
    createdToRaw: createdTo ? searchParams.createdTo : undefined,
    page,
  }

  let stores: Awaited<ReturnType<typeof listInternalStores>>
  let indicators: Awaited<ReturnType<typeof getInternalStoreDashboardIndicators>>
  let auditLogs: Awaited<ReturnType<typeof getRecentInternalAuditLogs>>
  let billingPlans: Awaited<
    ReturnType<typeof listActiveBillingPlansForInternalCreation>
  >
  let cityOptions: Awaited<ReturnType<typeof listInternalStoreCityFilterOptions>>

  try {
    ;[stores, indicators, auditLogs, billingPlans, cityOptions] =
      await Promise.all([
        listInternalStores({
          status,
          search,
          planId,
          access,
          city,
          createdFrom,
          createdTo,
          page,
        }),
        getInternalStoreDashboardIndicators({
          status,
          search,
          planId,
          access,
          city,
          createdFrom,
          createdTo,
        }),
        getRecentInternalAuditLogs(12),
        listActiveBillingPlansForInternalCreation(),
        listInternalStoreCityFilterOptions(),
      ])
  } catch (error) {
    console.error('[internal-operations] Failed to load stores panel', error)

    return (
      <div className="space-y-4 rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-950 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-100">
        <div>
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
            Operacao interna
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            Nao foi possivel carregar as lojas
          </h1>
        </div>
        <p className="text-sm text-rose-800 dark:text-rose-200">
          O acesso interno foi validado, mas a consulta dos dados falhou no
          servidor.
        </p>
        {operator.role === 'superadmin' && (
          <pre className="overflow-auto rounded-md border border-rose-200 bg-card p-3 text-xs text-rose-900 dark:border-rose-900 dark:text-rose-100">
            {getErrorMessage(error)}
          </pre>
        )}
      </div>
    )
  }

  const canReactivate = canUseInternalPermission({
    currentRole: operator.role,
    permission: 'reactivate_store',
  })
  const canArchive = canUseInternalPermission({
    currentRole: operator.role,
    permission: 'archive_store',
  })
  const canCreateStore = canUseInternalPermission({
    currentRole: operator.role,
    permission: 'create_store',
  })
  const canManageImplementationChecklist = canUseInternalPermission({
    currentRole: operator.role,
    permission: 'manage_implementation_checklist',
  })
  const canActivateImplementedStore = canUseInternalPermission({
    currentRole: operator.role,
    permission: 'activate_implemented_store',
  })
  const selectClassName =
    'h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'
  const hasAdvancedFilters = Boolean(
    search || planId || access || city || createdFrom || createdTo
  )
  const previousPageHref = buildStoresHref({
    basePath,
    filters,
    overrides: { page: stores.pagination.page - 1 },
  })
  const nextPageHref = buildStoresHref({
    basePath,
    filters,
    overrides: { page: stores.pagination.page + 1 },
  })

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Operacao interna
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Lojas e recuperacao
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Gerencie lojas por status, reative contas recuperadas e arquive
            lojas manualmente com auditoria.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
          {canCreateStore && (
            <Button asChild isClickable>
              <Link href="/internal/stores/new">
                <Plus className="size-4" />
                Cadastrar loja
              </Link>
            </Button>
          )}
        </div>
      </section>

      {searchParams.result && resultMessages[searchParams.result] && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-200">
          {resultMessages[searchParams.result]}
        </div>
      )}

      {searchParams.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-200">
          {searchParams.error}
        </div>
      )}

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold">
              Indicadores administrativos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Mesmos filtros aplicados na listagem. Valores financeiros usam
              assinaturas e faturas da base interna. Periodo: posicao atual por
              vencimento.
            </p>
          </div>
          <Badge variant="outline">
            Atualizado {formatDateTime(indicators.updatedAt)}
          </Badge>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="rounded-lg border-sky-200 bg-sky-50 py-4 shadow-xs hover:shadow-xs dark:border-sky-900/70 dark:bg-sky-950/25">
            <CardHeader className="flex flex-row items-center gap-2 px-4">
              <Store className="size-4 text-sky-700 dark:text-sky-300" />
              <CardTitle className="text-sm text-sky-800 dark:text-sky-300">
                Base filtrada
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4">
              <div className="text-3xl font-semibold text-sky-950 dark:text-sky-100">
                {formatInteger(indicators.totalStores)}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-sky-900 dark:text-sky-100 md:grid-cols-3">
                <span>
                  Implantacao:{' '}
                  <strong>
                    {indicators.commercialStatusCounts.implementing}
                  </strong>
                </span>
                <span>
                  Ativas:{' '}
                  <strong>{indicators.commercialStatusCounts.active}</strong>
                </span>
                <span>
                  Pendentes:{' '}
                  <strong>
                    {indicators.commercialStatusCounts.pending_recovery}
                  </strong>
                </span>
                <span>
                  Inativas:{' '}
                  <strong>{indicators.commercialStatusCounts.inactive}</strong>
                </span>
                <span>
                  Arquivadas:{' '}
                  <strong>{indicators.commercialStatusCounts.archived}</strong>
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-emerald-200 bg-emerald-50 py-4 shadow-xs hover:shadow-xs dark:border-emerald-900/70 dark:bg-emerald-950/25">
            <CardHeader className="flex flex-row items-center gap-2 px-4">
              <CircleDollarSign className="size-4 text-emerald-700 dark:text-emerald-300" />
              <CardTitle className="text-sm text-emerald-800 dark:text-emerald-300">
                Financeiro
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4">
              <div>
                <div className="text-2xl font-semibold text-emerald-950 dark:text-emerald-100">
                  {formatCurrency(
                    indicators.financial.monthlyContractedRevenue
                  )}
                </div>
                <p className="text-xs text-emerald-900 dark:text-emerald-100">
                  Receita mensal contratada
                </p>
              </div>
              <div className="grid gap-2 text-xs text-emerald-900 dark:text-emerald-100 sm:grid-cols-2">
                <span>
                  Em aberto:{' '}
                  <strong>
                    {formatCurrency(indicators.financial.openReceivables)}
                  </strong>{' '}
                  ({indicators.financial.openInvoices})
                </span>
                <span>
                  Vencido:{' '}
                  <strong>
                    {formatCurrency(indicators.financial.overdueReceivables)}
                  </strong>{' '}
                  ({indicators.financial.overdueInvoices})
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-emerald-900 dark:text-emerald-100 sm:grid-cols-3">
                <span>
                  Trial:{' '}
                  <strong>{indicators.subscriptionStatusCounts.trialing}</strong>
                </span>
                <span>
                  Ativas:{' '}
                  <strong>{indicators.subscriptionStatusCounts.active}</strong>
                </span>
                <span>
                  Atraso:{' '}
                  <strong>{indicators.subscriptionStatusCounts.past_due}</strong>
                </span>
                <span>
                  Pausadas:{' '}
                  <strong>{indicators.subscriptionStatusCounts.paused}</strong>
                </span>
                <span>
                  Canceladas:{' '}
                  <strong>{indicators.subscriptionStatusCounts.canceled}</strong>
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg border-violet-200 bg-violet-50 py-4 shadow-xs hover:shadow-xs dark:border-violet-900/70 dark:bg-violet-950/25">
            <CardHeader className="flex flex-row items-center gap-2 px-4">
              <KeyRound className="size-4 text-violet-700 dark:text-violet-300" />
              <CardTitle className="text-sm text-violet-800 dark:text-violet-300">
                Acesso
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 px-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-2xl font-semibold text-violet-950 dark:text-violet-100">
                    {indicators.access.storesWithActiveAdmin}
                  </div>
                  <p className="text-xs text-violet-900 dark:text-violet-100">
                    Com admin ativo
                  </p>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-violet-950 dark:text-violet-100">
                    {indicators.access.storesWithoutActiveAdmin}
                  </div>
                  <p className="text-xs text-violet-900 dark:text-violet-100">
                    Sem admin ativo
                  </p>
                </div>
              </div>
              <div className="text-xs text-violet-900 dark:text-violet-100">
                {indicators.access.activeAdminLinks} permissoes ativas /{' '}
                {indicators.access.revokedAdminLinks} revogadas
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <form
          className="rounded-lg border bg-card p-4"
          action={basePath}
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1.4fr)_repeat(5,minmax(150px,1fr))]">
            <Input
              name="q"
              defaultValue={search}
              placeholder="Buscar nome, e-mail, telefone ou documento"
              containerClassName="w-full"
            />
            <select
              name="status"
              defaultValue={status ?? ''}
              className={selectClassName}
              aria-label="Status da loja"
            >
              <option value="">Todos os status</option>
              {statusTabs
                .filter(tab => tab.value)
                .map(tab => (
                  <option key={tab.value} value={tab.value}>
                    {tab.label}
                  </option>
                ))}
            </select>
            <select
              name="planId"
              defaultValue={planId ? String(planId) : ''}
              className={selectClassName}
              aria-label="Plano"
            >
              <option value="">Todos os planos</option>
              {billingPlans.map(plan => (
                <option key={plan.id} value={plan.id}>
                  {plan.name}
                </option>
              ))}
            </select>
            <select
              name="access"
              defaultValue={access ?? ''}
              className={selectClassName}
              aria-label="Acesso administrativo"
            >
              <option value="">Todos os acessos</option>
              <option value="with_active_admin">Com admin ativo</option>
              <option value="without_active_admin">Sem admin ativo</option>
              <option value="with_revoked_admin">Com admin revogado</option>
            </select>
            <select
              name="city"
              defaultValue={city}
              className={selectClassName}
              aria-label="Cidade"
            >
              <option value="">Todas as cidades</option>
              {cityOptions.map(option => (
                <option
                  key={`${option.city}-${option.stateCode ?? ''}`}
                  value={option.city}
                >
                  {option.city}
                  {option.stateCode ? `/${option.stateCode}` : ''}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                name="createdFrom"
                defaultValue={searchParams.createdFrom ?? ''}
                aria-label="Cadastro inicial"
              />
              <Input
                type="date"
                name="createdTo"
                defaultValue={searchParams.createdTo ?? ''}
                aria-label="Cadastro final"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">
                {formatInteger(stores.pagination.totalItems)} lojas
              </Badge>
              {hasAdvancedFilters && <Badge variant="outline">Filtrado</Badge>}
            </div>
            <div className="flex gap-2">
              {hasAdvancedFilters && (
                <Button asChild variant="outline" isClickable>
                  <Link href={basePath}>Limpar filtros</Link>
                </Button>
              )}
              <Button type="submit" isClickable>
                <Search className="size-4" />
                Filtrar
              </Button>
            </div>
          </div>
        </form>

        <div className="flex flex-wrap gap-2">
          {statusTabs.map(tab => {
            const isActive = tab.value === status || (!tab.value && !status)
            return (
              <Button
                key={tab.label}
                asChild
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                isClickable
              >
                <Link
                  href={buildStoresHref({
                    basePath,
                    filters,
                    overrides: { status: tab.value, page: 1 },
                  })}
                >
                  {tab.label}
                </Link>
              </Button>
            )
          })}
        </div>

        <InternalStoresTable
          stores={serializeStoresForClient(stores.items)}
          canReactivate={canReactivate}
          canArchive={canArchive}
          canCreateStore={canCreateStore}
          canManageImplementationChecklist={canManageImplementationChecklist}
          canActivateImplementedStore={canActivateImplementedStore}
          returnTo={basePath}
        />

        <div className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div>
            Pagina {stores.pagination.page} de {stores.pagination.totalPages} -{' '}
            {formatInteger(stores.pagination.totalItems)} lojas encontradas
          </div>
          <div className="flex gap-2">
            <Button
              asChild={stores.pagination.hasPreviousPage}
              variant="outline"
              size="sm"
              disabled={!stores.pagination.hasPreviousPage}
              isClickable={stores.pagination.hasPreviousPage}
            >
              {stores.pagination.hasPreviousPage ? (
                <Link href={previousPageHref}>Anterior</Link>
              ) : (
                'Anterior'
              )}
            </Button>
            <Button
              asChild={stores.pagination.hasNextPage}
              variant="outline"
              size="sm"
              disabled={!stores.pagination.hasNextPage}
              isClickable={stores.pagination.hasNextPage}
            >
              {stores.pagination.hasNextPage ? (
                <Link href={nextPageHref}>Proxima</Link>
              ) : (
                'Proxima'
              )}
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold">Auditoria recente</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Registro simples das operacoes internas feitas nas lojas.
          </p>
        </div>
        <div className="divide-y">
          {auditLogs.length === 0 ? (
            <div className="px-5 py-6 text-sm text-muted-foreground">
              Nenhuma acao registrada ainda.
            </div>
          ) : (
            auditLogs.map(log => (
              <div
                key={log.id}
                className="flex flex-col gap-2 px-5 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {auditActionLabels[log.action] ?? log.action}
                    </Badge>
                    <span className="text-sm font-medium">
                      Loja #{log.storeId} - {log.previousStoreStatus} para{' '}
                      {log.newStoreStatus}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {log.reason}
                  </p>
                  {log.targetUserEmail && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Admin vinculado: {log.targetUserEmail}
                    </p>
                  )}
                </div>
                <div className="text-sm text-muted-foreground md:text-right">
                  <div>{log.actorEmail}</div>
                  <div>{formatDateTime(log.createdAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
