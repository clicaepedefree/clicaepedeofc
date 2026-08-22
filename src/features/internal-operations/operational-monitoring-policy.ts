export const operationalMonitoringSources = [
  'billing_cron',
  'billing_gateway_webhook',
  'billing_reminder',
  'billing_reconciliation',
  'billing_access_block',
  'subscription_plan_change',
] as const

export type OperationalMonitoringSource =
  (typeof operationalMonitoringSources)[number]

export const operationalAlertSeverities = ['info', 'warning', 'critical'] as const

export type OperationalAlertSeverity = (typeof operationalAlertSeverities)[number]

export type OperationalMonitoringAlert = {
  id: string
  source: OperationalMonitoringSource
  severity: OperationalAlertSeverity
  storeId: number | null
  storeName: string | null
  storeSubdomain: string | null
  correlationId: string
  title: string
  detail: string
  runbook: string
  createdAt: Date
  lastSeenAt: Date
}

export type OperationalQueueSnapshot = {
  source: OperationalMonitoringSource
  label: string
  queued: number
  failed: number
  oldestQueuedMinutes: number | null
  maxAttempts: number
}

export type OperationalMonitoringSummary = {
  status: 'healthy' | 'attention' | 'incident'
  criticalAlerts: number
  warningAlerts: number
  actionableAlerts: number
  exhaustedRetries: number
  queuePressure: number
}

export const exhaustedRetryThreshold = 3
export const staleQueueThresholdMinutes = 30

export function getOperationalAlertSeverity({
  critical,
  warning,
}: {
  critical: boolean
  warning: boolean
}): OperationalAlertSeverity {
  if (critical) return 'critical'
  if (warning) return 'warning'
  return 'info'
}

export function isOperationalRetryExhausted({
  attempts,
  threshold = exhaustedRetryThreshold,
}: {
  attempts: number
  threshold?: number
}) {
  return attempts >= threshold
}

export function getOperationalQueuePressure(
  queue: Pick<
    OperationalQueueSnapshot,
    'queued' | 'failed' | 'oldestQueuedMinutes' | 'maxAttempts'
  >
) {
  const staleQueued =
    queue.oldestQueuedMinutes !== null &&
    queue.oldestQueuedMinutes >= staleQueueThresholdMinutes

  if (queue.failed > 0 && queue.maxAttempts >= exhaustedRetryThreshold) {
    return 'critical' as const
  }

  if (queue.failed > 0 || staleQueued || queue.queued >= 10) {
    return 'warning' as const
  }

  return 'healthy' as const
}

export function buildOperationalMonitoringSummary({
  alerts,
  queues,
}: {
  alerts: OperationalMonitoringAlert[]
  queues: OperationalQueueSnapshot[]
}): OperationalMonitoringSummary {
  const criticalAlerts = alerts.filter(
    alert => alert.severity === 'critical'
  ).length
  const warningAlerts = alerts.filter(
    alert => alert.severity === 'warning'
  ).length
  const exhaustedRetries = queues.filter(
    queue => queue.maxAttempts >= exhaustedRetryThreshold && queue.failed > 0
  ).length
  const queuePressure = queues.filter(
    queue => getOperationalQueuePressure(queue) !== 'healthy'
  ).length

  return {
    status:
      criticalAlerts > 0 || exhaustedRetries > 0
        ? 'incident'
        : warningAlerts > 0 || queuePressure > 0
          ? 'attention'
          : 'healthy',
    criticalAlerts,
    warningAlerts,
    actionableAlerts: alerts.length,
    exhaustedRetries,
    queuePressure,
  }
}

export function redactOperationalCorrelationId(value: string | null | undefined) {
  if (!value) return 'sem-correlacao'

  const normalized = value.trim()
  if (normalized.length <= 48) return normalized

  return `${normalized.slice(0, 24)}...${normalized.slice(-12)}`
}

export function sanitizeOperationalAlertDetail(
  value: string | null | undefined
) {
  if (!value?.trim()) return 'Sem detalhe operacional informado.'

  return value
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[documento]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[documento]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[telefone]')
    .replace(
      /\b(?:payload|headers|authorization|token|secret|signature)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|\{[^}]*\}|[^\s,;.]+)/gi,
      '[dado operacional protegido]'
    )
    .slice(0, 280)
}

export function getOperationalRunbook({
  source,
  severity,
}: {
  source: OperationalMonitoringSource
  severity: OperationalAlertSeverity
}) {
  const prefix =
    severity === 'critical'
      ? 'Acionar responsavel e registrar decisao antes de retentar.'
      : 'Verificar contexto e acompanhar a proxima execucao.'

  const runbooks: Record<OperationalMonitoringSource, string> = {
    billing_cron:
      'Conferir o ultimo cron de cobranca, validar CRON_SECRET e reexecutar apos revisar faturas afetadas.',
    billing_gateway_webhook:
      'Abrir evento do gateway, comparar assinatura/payload normalizado e decidir entre retentar ou tratar manualmente.',
    billing_reminder:
      'Validar canal, destinatario e regra de lembrete antes de reenfileirar notificacao.',
    billing_reconciliation:
      'Comparar fatura, pagamento e evento do gateway; resolver divergencia antes de fechar o alerta.',
    billing_access_block:
      'Confirmar fatura vencida, bloqueio ativo e comunicacao com a loja antes de desbloquear manualmente.',
    subscription_plan_change:
      'Verificar assinatura atual, plano destino e vigencia; aplicar manualmente se o cron nao processou.',
  }

  return `${prefix} ${runbooks[source]}`
}
