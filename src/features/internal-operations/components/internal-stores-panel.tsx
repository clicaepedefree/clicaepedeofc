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
  listInternalStores,
  parseStoreStatus,
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

const buildStatusHref = ({
  basePath,
  status,
  search,
}: {
  basePath: string
  status?: InternalStoreStatus
  search?: string
}) => {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (search) params.set('q', search)

  const query = params.toString()
  return query ? `${basePath}?${query}` : basePath
}

const serializeStoresForClient = (
  stores: Awaited<ReturnType<typeof listInternalStores>>
): SerializableInternalStoreListItem[] =>
  stores.map(store => ({
    ...store,
    statusUpdatedAt: store.statusUpdatedAt.toISOString(),
    createdAt: store.createdAt.toISOString(),
    updatedAt: store.updatedAt.toISOString(),
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

  let stores: Awaited<ReturnType<typeof listInternalStores>>
  let indicators: Awaited<ReturnType<typeof getInternalStoreDashboardIndicators>>
  let auditLogs: Awaited<ReturnType<typeof getRecentInternalAuditLogs>>

  try {
    ;[stores, indicators, auditLogs] = await Promise.all([
      listInternalStores({ status, search }),
      getInternalStoreDashboardIndicators({ status, search }),
      getRecentInternalAuditLogs(12),
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
          <form className="flex w-full gap-2 md:w-[380px]" action={basePath}>
            {status && <input type="hidden" name="status" value={status} />}
            <Input
              name="q"
              defaultValue={search}
              placeholder="Buscar loja, subdominio ou admin"
              containerClassName="flex-1"
            />
            <Button type="submit" isClickable>
              <Search className="size-4" />
              Buscar
            </Button>
          </form>
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
                  href={buildStatusHref({
                    basePath,
                    status: tab.value,
                    search,
                  })}
                >
                  {tab.label}
                </Link>
              </Button>
            )
          })}
        </div>

        <InternalStoresTable
          stores={serializeStoresForClient(stores)}
          canReactivate={canReactivate}
          canArchive={canArchive}
          canCreateStore={canCreateStore}
          canManageImplementationChecklist={canManageImplementationChecklist}
          canActivateImplementedStore={canActivateImplementedStore}
          returnTo={basePath}
        />
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
