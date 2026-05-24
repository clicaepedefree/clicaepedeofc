import { canUseInternalRole, requireInternalOperator } from '@/features/internal-operations/access'
import {
  InternalStoresTable,
  type SerializableInternalStoreListItem,
} from '@/features/internal-operations/components/internal-stores-table'
import { getInternalStoreStatusCounts, getRecentInternalAuditLogs, listInternalStores, parseStoreStatus, type InternalStoreStatus } from '@/features/internal-operations/db'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/card'
import { Input } from '@/shared/input'
import { Search } from 'lucide-react'
import Link from 'next/link'

type InternalStoresPageProps = {
  searchParams: Promise<{
    status?: string
    q?: string
    result?: string
    error?: string
  }>
}

const statusTabs: { value?: InternalStoreStatus; label: string }[] = [
  { label: 'Todas' },
  { value: 'active', label: 'Ativas' },
  { value: 'pending_recovery', label: 'Pendentes' },
  { value: 'inactive', label: 'Inativas' },
  { value: 'archived', label: 'Arquivadas' },
]

const resultMessages: Record<string, string> = {
  'loja-reativada': 'Loja reativada e administrador vinculado com sucesso.',
  'loja-arquivada': 'Loja arquivada e acessos ativos revogados com sucesso.',
}

const formatDateTime = (date: Date | string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))

const buildStatusHref = ({
  status,
  search,
}: {
  status?: InternalStoreStatus
  search?: string
}) => {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (search) params.set('q', search)

  const query = params.toString()
  return query ? `/internal/stores?${query}` : '/internal/stores'
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
  }))

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  return 'Erro desconhecido'
}

export default async function InternalStoresPage({
  searchParams,
}: InternalStoresPageProps) {
  const operator = await requireInternalOperator('viewer')
  const params = await searchParams
  const status = parseStoreStatus(params.status)
  const search = params.q?.trim() ?? ''

  let stores: Awaited<ReturnType<typeof listInternalStores>>
  let counts: Awaited<ReturnType<typeof getInternalStoreStatusCounts>>
  let auditLogs: Awaited<ReturnType<typeof getRecentInternalAuditLogs>>

  try {
    ;[stores, counts, auditLogs] = await Promise.all([
      listInternalStores({ status, search }),
      getInternalStoreStatusCounts(),
      getRecentInternalAuditLogs(12),
    ])
  } catch (error) {
    console.error('[internal/stores] Failed to load internal operations panel', error)

    return (
      <div className="space-y-4 rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-950">
        <div>
          <p className="text-sm font-medium text-rose-700">Operacao interna</p>
          <h1 className="mt-1 text-2xl font-semibold">Nao foi possivel carregar as lojas</h1>
        </div>
        <p className="text-sm text-rose-800">
          O acesso interno foi validado, mas a consulta dos dados falhou no servidor.
        </p>
        {operator.role === 'ops_admin' && (
          <pre className="overflow-auto rounded-md border border-rose-200 bg-white p-3 text-xs text-rose-900">
            {getErrorMessage(error)}
          </pre>
        )}
      </div>
    )
  }

  const canReactivate = canUseInternalRole({
    currentRole: operator.role,
    minimumRole: 'support',
  })
  const canArchive = canUseInternalRole({
    currentRole: operator.role,
    minimumRole: 'ops_admin',
  })

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">Operacao interna</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Lojas e recuperacao</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Gerencie lojas por status, reative contas recuperadas e arquive lojas manualmente com auditoria.
          </p>
        </div>
        <form className="flex w-full gap-2 md:w-[380px]" action="/internal/stores">
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
      </section>

      {params.result && resultMessages[params.result] && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {resultMessages[params.result]}
        </div>
      )}

      {params.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {params.error}
        </div>
      )}

      <section className="grid gap-3 md:grid-cols-4">
        <Card className="rounded-lg border-slate-200 bg-white py-4 shadow-xs hover:shadow-xs">
          <CardHeader className="px-4">
            <CardTitle className="text-sm text-slate-500">Ativas</CardTitle>
          </CardHeader>
          <CardContent className="px-4 text-2xl font-semibold">{counts.active}</CardContent>
        </Card>
        <Card className="rounded-lg border-amber-200 bg-amber-50 py-4 shadow-xs hover:shadow-xs">
          <CardHeader className="px-4">
            <CardTitle className="text-sm text-amber-800">Pendentes</CardTitle>
          </CardHeader>
          <CardContent className="px-4 text-2xl font-semibold text-amber-950">
            {counts.pending_recovery}
          </CardContent>
        </Card>
        <Card className="rounded-lg border-slate-200 bg-white py-4 shadow-xs hover:shadow-xs">
          <CardHeader className="px-4">
            <CardTitle className="text-sm text-slate-500">Inativas</CardTitle>
          </CardHeader>
          <CardContent className="px-4 text-2xl font-semibold">{counts.inactive}</CardContent>
        </Card>
        <Card className="rounded-lg border-rose-200 bg-rose-50 py-4 shadow-xs hover:shadow-xs">
          <CardHeader className="px-4">
            <CardTitle className="text-sm text-rose-800">Arquivadas</CardTitle>
          </CardHeader>
          <CardContent className="px-4 text-2xl font-semibold text-rose-950">
            {counts.archived}
          </CardContent>
        </Card>
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
                <Link href={buildStatusHref({ status: tab.value, search })}>
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
        />
      </section>

      <section className="rounded-lg border bg-white">
        <div className="border-b px-5 py-4">
          <h2 className="text-base font-semibold">Auditoria recente</h2>
          <p className="mt-1 text-sm text-slate-500">
            Registro simples das operacoes internas feitas nas lojas.
          </p>
        </div>
        <div className="divide-y">
          {auditLogs.length === 0 ? (
            <div className="px-5 py-6 text-sm text-slate-500">Nenhuma acao registrada ainda.</div>
          ) : (
            auditLogs.map(log => (
              <div key={log.id} className="flex flex-col gap-2 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {log.action === 'reactivate_store' ? 'Reativacao' : 'Arquivamento'}
                    </Badge>
                    <span className="text-sm font-medium">
                      Loja #{log.storeId} · {log.previousStoreStatus} → {log.newStoreStatus}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{log.reason}</p>
                  {log.targetUserEmail && (
                    <p className="mt-1 text-xs text-slate-500">
                      Admin vinculado: {log.targetUserEmail}
                    </p>
                  )}
                </div>
                <div className="text-sm text-slate-500 md:text-right">
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
