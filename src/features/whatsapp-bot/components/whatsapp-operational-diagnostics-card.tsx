'use client'

import { selectedStoreIdAtom } from '@/features/store/state'
import { useWhatsappOperationalDiagnostics } from '@/features/whatsapp-bot/hooks/use-whatsapp-operational-diagnostics'
import type { WhatsappOperationalDiagnostics } from '@/features/whatsapp-bot/diagnostics-policy'
import { Badge } from '@/shared/badge'
import { Button } from '@/shared/button'
import { cn } from '@/shared/lib/utils'
import { LoadingSpinner } from '@/shared/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/table'
import { Body } from '@/shared/typography/body'
import { Headline } from '@/shared/typography/headline'
import { useAtomValue } from 'jotai'
import {
  Activity,
  AlertTriangle,
  BellRing,
  Bot,
  CheckCircle2,
  Clock3,
  MessageSquareText,
  RefreshCw,
  Route,
  ShieldCheck,
} from 'lucide-react'

const formatDateTime = (value?: Date | string | null) => {
  if (!value) return 'Sem registro'

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

const sourceLabels: Record<
  WhatsappOperationalDiagnostics['logs'][number]['source'],
  string
> = {
  session: 'Conexao',
  message: 'Mensagem',
  conversation: 'Conversa',
  notification: 'Notificacao',
}

const resultLabels: Record<
  WhatsappOperationalDiagnostics['logs'][number]['result'],
  string
> = {
  success: 'OK',
  warning: 'Atencao',
  failed: 'Falha',
  pending: 'Pendente',
}

const getResultBadgeVariant = (
  result: WhatsappOperationalDiagnostics['logs'][number]['result']
) => {
  if (result === 'failed') return 'destructive' as const
  if (result === 'warning') return 'warning' as const
  if (result === 'pending') return 'outline' as const
  return 'secondary' as const
}

const getStateTone = (status: string) => {
  if (status === 'connected') {
    return {
      label: 'Saudavel',
      icon: CheckCircle2,
      className:
        'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
    }
  }

  if (status === 'error') {
    return {
      label: 'Com falha',
      icon: AlertTriangle,
      className:
        'border-destructive/30 bg-destructive/10 text-destructive dark:bg-destructive/15',
    }
  }

  return {
    label: 'Acompanhar',
    icon: Clock3,
    className:
      'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-200',
  }
}

function MetricTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Activity
  label: string
  value: number
  detail: string
}) {
  return (
    <div className="rounded-md border bg-background/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Body variant={100} className="text-muted-foreground">
            {label}
          </Body>
          <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-md border bg-card">
          <Icon className="h-4 w-4 text-primary" />
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function LastMessageCard({
  title,
  message,
}: {
  title: string
  message:
    | WhatsappOperationalDiagnostics['lastInboundMessage']
    | WhatsappOperationalDiagnostics['lastOutboundMessage']
}) {
  return (
    <div className="rounded-md border bg-background/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Body variant={100} className="text-muted-foreground">
            {title}
          </Body>
          <p className="mt-1 text-sm font-medium text-foreground">
            {message ? formatDateTime(message.occurredAt) : 'Sem registro'}
          </p>
        </div>
        {message && <Badge variant="outline">{message.status}</Badge>}
      </div>
      <p className="mt-3 line-clamp-2 min-h-10 text-sm text-muted-foreground">
        {message?.preview ?? 'Nenhuma mensagem encontrada para esta loja.'}
      </p>
      {message && (
        <p className="mt-2 text-xs text-muted-foreground">
          Conversa {message.conversationId} · Evento {message.id}
        </p>
      )}
    </div>
  )
}

export function WhatsappOperationalDiagnosticsCard() {
  const selectedStoreId = useAtomValue(selectedStoreIdAtom)
  const { diagnostics, error, isLoading, refetch, isRefetching } =
    useWhatsappOperationalDiagnostics(selectedStoreId)

  const stateTone = getStateTone(diagnostics?.state.status ?? 'not_configured')
  const StateIcon = stateTone.icon

  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Headline variant={500}>Diagnostico operacional</Headline>
                <Badge variant="outline" className={stateTone.className}>
                  {stateTone.label}
                </Badge>
              </div>
              <Body
                variant={200}
                fontWeight="regular"
                className="max-w-2xl text-muted-foreground"
              >
                Estados, falhas e metricas do robo com dados sensiveis
                mascarados para analise segura.
              </Body>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
          >
            <RefreshCw
              className={cn(
                'h-4 w-4',
                (isLoading || isRefetching) && 'animate-spin'
              )}
            />
            Atualizar
          </Button>
        </div>

        {error && (
          <div
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200"
            role="alert"
          >
            Nao foi possivel carregar o diagnostico do robo.
          </div>
        )}

        {isLoading ? (
          <div className="flex min-h-64 items-center justify-center rounded-md border bg-background/60">
            <LoadingSpinner size={24} />
          </div>
        ) : (
          <>
            <div className={cn('rounded-md border p-3', stateTone.className)}>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-md border bg-background/60">
                    <StateIcon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      Estado atual:{' '}
                      {diagnostics?.state.status ?? 'nao configurado'}
                    </p>
                    <p className="text-xs opacity-80">
                      Provider {diagnostics?.state.provider ?? 'sem provider'} ·
                      Sessao {diagnostics?.state.providerSessionId ?? 'sem id'}
                    </p>
                  </div>
                </div>
                <div className="text-sm md:text-right">
                  <p className="font-medium">
                    Heartbeat{' '}
                    {formatDateTime(diagnostics?.state.lastHeartbeatAt)}
                  </p>
                  <p className="text-xs opacity-80">
                    Gerado em {formatDateTime(diagnostics?.generatedAt)}
                  </p>
                </div>
              </div>
              {diagnostics?.state.lastErrorMessage && (
                <p className="mt-3 text-sm">
                  Ultimo erro: {diagnostics.state.lastErrorMessage}
                </p>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <MetricTile
                icon={Bot}
                label="IA"
                value={diagnostics?.metrics.aiResponses ?? 0}
                detail="Respostas automaticas geradas sem fallback."
              />
              <MetricTile
                icon={Route}
                label="Handoff"
                value={diagnostics?.metrics.handoffs ?? 0}
                detail="Conversas em atendimento humano ou encaminhadas."
              />
              <MetricTile
                icon={MessageSquareText}
                label="CTA"
                value={diagnostics?.metrics.ctas ?? 0}
                detail="Chamadas para cardapio digital enviadas pelo robo."
              />
              <MetricTile
                icon={BellRing}
                label="Notificacoes"
                value={diagnostics?.metrics.notificationsSent ?? 0}
                detail={`${diagnostics?.metrics.notificationsQueued ?? 0} pendentes, ${diagnostics?.metrics.notificationsFailed ?? 0} falhas.`}
              />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <LastMessageCard
                title="Ultima recebida"
                message={diagnostics?.lastInboundMessage ?? null}
              />
              <LastMessageCard
                title="Ultima enviada"
                message={diagnostics?.lastOutboundMessage ?? null}
              />
            </div>

            <div className="rounded-md border bg-background/60">
              <div className="border-b p-4">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-semibold">
                      Trilhas recentes do robo
                    </p>
                    <p className="text-sm text-muted-foreground">
                      IDs curtos, etapa, resultado e motivo tecnico sem
                      telefone, e-mail, CPF, token ou payload bruto.
                    </p>
                  </div>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {diagnostics?.logs.length ? (
                    diagnostics.logs.map(log => (
                      <TableRow key={log.id}>
                        <TableCell>{formatDateTime(log.occurredAt)}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">
                              {sourceLabels[log.source]}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {log.label}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getResultBadgeVariant(log.result)}>
                            {resultLabels[log.result]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <p>Conversa {log.conversationId ?? '-'}</p>
                            <p>Evento {log.eventId ?? '-'}</p>
                            <p>Pedido {log.orderId ?? '-'}</p>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[320px] whitespace-normal">
                          {log.reason}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="h-28 text-center text-muted-foreground"
                      >
                        Nenhum evento recente encontrado para esta loja.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
