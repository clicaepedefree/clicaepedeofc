import {
  getOperationalMonitoringSnapshot,
  type OperationalMonitoringSnapshot,
} from '@/features/internal-operations/db'
import {
  getOperationalQueuePressure,
  type OperationalAlertSeverity,
  type OperationalMonitoringSource,
} from '@/features/internal-operations/operational-monitoring-policy'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/table'
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import Link from 'next/link'

type InternalMonitoringPanelProps = {
  basePath: string
}

const sourceLabels: Record<OperationalMonitoringSource, string> = {
  billing_cron: 'Cron de cobranca',
  billing_gateway_webhook: 'Webhook de pagamento',
  billing_reminder: 'Notificacao',
  billing_reconciliation: 'Conciliacao',
  billing_access_block: 'Bloqueio',
  subscription_plan_change: 'Mudanca de plano',
}

const severityLabels: Record<OperationalAlertSeverity, string> = {
  info: 'Info',
  warning: 'Atencao',
  critical: 'Critico',
}

const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)

const formatMinutes = (minutes: number | null) => {
  if (minutes === null) return 'Sem fila'
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest > 0 ? `${hours}h ${rest}min` : `${hours}h`
}

const getSummaryTone = (status: OperationalMonitoringSnapshot['summary']['status']) => {
  if (status === 'incident') {
    return {
      label: 'Incidente',
      badge: 'destructive' as const,
      icon: ShieldAlert,
      className:
        'border-destructive/30 bg-destructive/10 text-destructive dark:bg-destructive/15',
    }
  }

  if (status === 'attention') {
    return {
      label: 'Atencao',
      badge: 'warning' as const,
      icon: AlertTriangle,
      className:
        'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200',
    }
  }

  return {
    label: 'Saudavel',
    badge: 'secondary' as const,
    icon: CheckCircle2,
    className:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
  }
}

const getSeverityBadge = (severity: OperationalAlertSeverity) => {
  if (severity === 'critical') return 'destructive' as const
  if (severity === 'warning') return 'warning' as const
  return 'secondary' as const
}

const getQueueBadge = (
  queue: OperationalMonitoringSnapshot['queues'][number]
) => {
  const pressure = getOperationalQueuePressure(queue)
  if (pressure === 'critical') return 'destructive' as const
  if (pressure === 'warning') return 'warning' as const
  return 'secondary' as const
}

const getStoreLabel = (
  alert: OperationalMonitoringSnapshot['alerts'][number]
) => {
  if (alert.storeName) return alert.storeName
  if (alert.storeSubdomain) return alert.storeSubdomain
  if (alert.storeId) return `Loja #${alert.storeId}`
  return 'Sem loja vinculada'
}

export async function InternalMonitoringPanel({
  basePath,
}: InternalMonitoringPanelProps) {
  const snapshot = await getOperationalMonitoringSnapshot()
  const tone = getSummaryTone(snapshot.summary.status)
  const StatusIcon = tone.icon

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Monitoramento operacional
            </h1>
            <Badge variant={tone.badge}>{tone.label}</Badge>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Acompanhe falhas de jobs, webhooks, notificacoes, bloqueios e filas
            com correlacao por loja, sem expor dados sensiveis de clientes.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={basePath}>
            <RefreshCw className="size-4" />
            Atualizar
          </Link>
        </Button>
      </div>

      <Card className={tone.className}>
        <CardContent className="flex flex-col gap-3 pt-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-md border bg-background/60">
              <StatusIcon className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Estado atual da operacao</p>
              <p className="text-sm opacity-80">
                Gerado em {formatDateTime(snapshot.generatedAt)}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <SummaryStat
              label="Criticos"
              value={snapshot.summary.criticalAlerts}
            />
            <SummaryStat
              label="Atencao"
              value={snapshot.summary.warningAlerts}
            />
            <SummaryStat
              label="Acionaveis"
              value={snapshot.summary.actionableAlerts}
            />
            <SummaryStat
              label="Retentativas"
              value={snapshot.summary.exhaustedRetries}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          icon={Activity}
          label="Filas com pressao"
          value={snapshot.summary.queuePressure}
          description="Filas com falha, atraso ou volume acima do esperado."
        />
        <MetricCard
          icon={BellRing}
          label="Alertas acionaveis"
          value={snapshot.summary.actionableAlerts}
          description="Itens com runbook e contexto minimo para tratamento."
        />
        <MetricCard
          icon={Clock3}
          label="Retentativas esgotadas"
          value={snapshot.summary.exhaustedRetries}
          description="Falhas que precisam sair do retry automatico."
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filas e metricas operacionais</CardTitle>
          <CardDescription>
            Latencia aproximada pela fila mais antiga, volume pendente, falhas e
            tentativas maximas observadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fonte</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Em fila</TableHead>
                <TableHead className="text-right">Falhas</TableHead>
                <TableHead className="text-right">Mais antigo</TableHead>
                <TableHead className="text-right">Tentativas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshot.queues.map(queue => (
                <TableRow key={queue.source}>
                  <TableCell className="font-medium">{queue.label}</TableCell>
                  <TableCell>
                    <Badge variant={getQueueBadge(queue)}>
                      {getOperationalQueuePressure(queue)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{queue.queued}</TableCell>
                  <TableCell className="text-right">{queue.failed}</TableCell>
                  <TableCell className="text-right">
                    {formatMinutes(queue.oldestQueuedMinutes)}
                  </TableCell>
                  <TableCell className="text-right">
                    {queue.maxAttempts}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alertas recentes</CardTitle>
          <CardDescription>
            Alertas mostram somente identificadores operacionais, loja e
            runbook. Payloads, CPFs, telefones e enderecos ficam fora desta
            visao.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {snapshot.alerts.length === 0 ? (
            <div className="rounded-md border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              Nenhum alerta operacional encontrado agora.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severidade</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Loja</TableHead>
                  <TableHead>Correlacao</TableHead>
                  <TableHead>Resumo</TableHead>
                  <TableHead>Runbook</TableHead>
                  <TableHead className="text-right">Ultima vez</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshot.alerts.map(alert => (
                  <TableRow key={alert.id}>
                    <TableCell>
                      <Badge variant={getSeverityBadge(alert.severity)}>
                        {severityLabels[alert.severity]}
                      </Badge>
                    </TableCell>
                    <TableCell>{sourceLabels[alert.source]}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{getStoreLabel(alert)}</p>
                        {alert.storeSubdomain ? (
                          <p className="text-xs text-muted-foreground">
                            {alert.storeSubdomain}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-48 whitespace-normal font-mono text-xs text-muted-foreground">
                      {alert.correlationId}
                    </TableCell>
                    <TableCell className="max-w-72 whitespace-normal">
                      <p className="font-medium">{alert.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {alert.detail}
                      </p>
                    </TableCell>
                    <TableCell className="max-w-80 whitespace-normal text-xs text-muted-foreground">
                      {alert.runbook}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDateTime(alert.lastSeenAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background/60 px-3 py-2">
      <p className="text-lg font-semibold leading-none">{value}</p>
      <p className="mt-1 text-xs opacity-75">{label}</p>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  description: string
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 pt-0">
        <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="space-y-1">
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </CardContent>
    </Card>
  )
}
