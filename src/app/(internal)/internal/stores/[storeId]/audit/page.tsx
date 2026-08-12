import { requireInternalPermission } from '@/features/internal-operations/access'
import { listAdministrativeAuditLogsByStore } from '@/features/internal-operations/db'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/card'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

type StoreAuditPageProps = {
  params: Promise<{ storeId: string }>
  searchParams: Promise<{
    cursorId?: string
    cursorCreatedAt?: string
  }>
}

const formatDateTime = (date: Date | string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))

const formatJson = (value: unknown) => {
  if (!value) return '-'
  return JSON.stringify(value, null, 2)
}

export default async function StoreAuditPage({
  params,
  searchParams,
}: StoreAuditPageProps) {
  await requireInternalPermission('view_sensitive_audit_logs')

  const { storeId: storeIdParam } = await params
  const { cursorId, cursorCreatedAt } = await searchParams
  const storeId = Number(storeIdParam)

  if (!Number.isInteger(storeId) || storeId <= 0) {
    notFound()
  }

  const cursor =
    cursorId && cursorCreatedAt
      ? {
          id: Number(cursorId),
          createdAt: new Date(cursorCreatedAt),
        }
      : undefined

  const audit = await listAdministrativeAuditLogsByStore({
    storeId,
    cursor:
      cursor &&
      Number.isInteger(cursor.id) &&
      !Number.isNaN(cursor.createdAt.getTime())
        ? cursor
        : undefined,
  })

  const nextHref = audit.nextCursor
    ? `/internal/stores/${storeId}/audit?cursorId=${audit.nextCursor.id}&cursorCreatedAt=${encodeURIComponent(audit.nextCursor.createdAt.toISOString())}`
    : null

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href="/internal/stores">
              <ArrowLeft className="size-4" />
              Voltar para lojas
            </Link>
          </Button>
          <p className="mt-3 text-sm font-medium text-muted-foreground">
            Auditoria administrativa
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            Loja #{storeId}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Historico imutavel das operacoes sensiveis feitas pela equipe interna.
          </p>
        </div>
        {nextHref && (
          <Button asChild variant="outline">
            <Link href={nextHref}>
              Proxima pagina
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        )}
      </div>

      {audit.items.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma acao registrada para esta loja.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {audit.items.map(log => (
            <Card key={log.id} className="rounded-lg border-border bg-card">
              <CardHeader className="gap-3 border-b px-5 py-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{log.scope}</Badge>
                    <Badge variant="outline">{log.action}</Badge>
                    <Badge variant={log.status === 'failed' ? 'destructive' : 'secondary'}>
                      {log.status === 'failed' ? 'Falha registrada' : 'Registrado'}
                    </Badge>
                  </div>
                  <CardTitle className="mt-3 text-base">
                    {log.entityType}
                    {log.entityId ? ` #${log.entityId}` : ''}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {log.reason}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground md:text-right">
                  <div>{log.actorEmail}</div>
                  <div>{formatDateTime(log.createdAt)}</div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4 p-5 md:grid-cols-2">
                <div>
                  <h2 className="mb-2 text-sm font-medium">Antes</h2>
                  <pre className="max-h-64 overflow-auto rounded-md border bg-muted/50 p-3 text-xs">
                    {formatJson(log.previousValues)}
                  </pre>
                </div>
                <div>
                  <h2 className="mb-2 text-sm font-medium">Depois</h2>
                  <pre className="max-h-64 overflow-auto rounded-md border bg-muted/50 p-3 text-xs">
                    {formatJson(log.newValues)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
