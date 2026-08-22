import { describe, expect, test } from 'bun:test'
import {
  buildOperationalMonitoringSummary,
  exhaustedRetryThreshold,
  getOperationalAlertSeverity,
  getOperationalQueuePressure,
  getOperationalRunbook,
  isOperationalRetryExhausted,
  redactOperationalCorrelationId,
  sanitizeOperationalAlertDetail,
  type OperationalMonitoringAlert,
  type OperationalQueueSnapshot,
} from './operational-monitoring-policy'

const alert = (
  overrides: Partial<OperationalMonitoringAlert>
): OperationalMonitoringAlert => ({
  id: 'billing_gateway_webhook:101',
  source: 'billing_gateway_webhook',
  severity: 'warning',
  storeId: 73,
  storeName: 'Loja QA',
  storeSubdomain: 'loja-qa',
  correlationId: 'gateway:evt_123',
  title: 'Webhook pendente',
  detail: 'Evento aguardando processamento.',
  runbook: 'Verificar evento.',
  createdAt: new Date('2026-08-21T12:00:00.000Z'),
  lastSeenAt: new Date('2026-08-21T12:10:00.000Z'),
  ...overrides,
})

const queue = (
  overrides: Partial<OperationalQueueSnapshot>
): OperationalQueueSnapshot => ({
  source: 'billing_gateway_webhook',
  label: 'Webhooks de pagamento',
  queued: 0,
  failed: 0,
  oldestQueuedMinutes: null,
  maxAttempts: 0,
  ...overrides,
})

describe('operational monitoring policy', () => {
  test('prioritizes critical alerts over warnings', () => {
    expect(
      getOperationalAlertSeverity({ critical: true, warning: true })
    ).toBe('critical')
    expect(
      getOperationalAlertSeverity({ critical: false, warning: true })
    ).toBe('warning')
    expect(
      getOperationalAlertSeverity({ critical: false, warning: false })
    ).toBe('info')
  })

  test('marks retry exhaustion from the documented threshold', () => {
    expect(isOperationalRetryExhausted({ attempts: 2 })).toBe(false)
    expect(
      isOperationalRetryExhausted({ attempts: exhaustedRetryThreshold })
    ).toBe(true)
  })

  test('classifies queue pressure by failures, stale items and exhausted retries', () => {
    expect(getOperationalQueuePressure(queue({ queued: 1 }))).toBe('healthy')
    expect(
      getOperationalQueuePressure(queue({ queued: 1, oldestQueuedMinutes: 45 }))
    ).toBe('warning')
    expect(getOperationalQueuePressure(queue({ failed: 1 }))).toBe('warning')
    expect(
      getOperationalQueuePressure(
        queue({ failed: 1, maxAttempts: exhaustedRetryThreshold })
      )
    ).toBe('critical')
  })

  test('builds a rollout summary that separates healthy, attention and incident states', () => {
    expect(buildOperationalMonitoringSummary({ alerts: [], queues: [] })).toEqual({
      status: 'healthy',
      criticalAlerts: 0,
      warningAlerts: 0,
      actionableAlerts: 0,
      exhaustedRetries: 0,
      queuePressure: 0,
    })

    expect(
      buildOperationalMonitoringSummary({
        alerts: [alert({ severity: 'warning' })],
        queues: [queue({ queued: 12 })],
      })
    ).toMatchObject({
      status: 'attention',
      warningAlerts: 1,
      queuePressure: 1,
    })

    expect(
      buildOperationalMonitoringSummary({
        alerts: [alert({ severity: 'critical' })],
        queues: [queue({ failed: 1, maxAttempts: 4 })],
      })
    ).toMatchObject({
      status: 'incident',
      criticalAlerts: 1,
      exhaustedRetries: 1,
    })
  })

  test('keeps correlation ids useful without rendering long raw values', () => {
    expect(redactOperationalCorrelationId(null)).toBe('sem-correlacao')
    expect(redactOperationalCorrelationId('invoice:CP-1')).toBe('invoice:CP-1')
    expect(redactOperationalCorrelationId('x'.repeat(80))).toBe(
      `${'x'.repeat(24)}...${'x'.repeat(12)}`
    )
  })

  test('returns actionable runbooks for every monitored source', () => {
    expect(
      getOperationalRunbook({
        source: 'billing_reconciliation',
        severity: 'critical',
      })
    ).toContain('Comparar fatura')
    expect(
      getOperationalRunbook({
        source: 'billing_reminder',
        severity: 'warning',
      })
    ).toContain('acompanhar a proxima execucao')
  })

  test('sanitizes alert details before rendering operational messages', () => {
    expect(
      sanitizeOperationalAlertDetail(
        'Erro payload={"cliente":"joao"} email joao@email.com cpf 123.456.789-00 telefone +55 11 99999-9999 token=abc'
      )
    ).toBe(
      'Erro [dado operacional protegido] email [email] cpf [documento] telefone [telefone] [dado operacional protegido]'
    )

    expect(sanitizeOperationalAlertDetail('')).toBe(
      'Sem detalhe operacional informado.'
    )
  })
})
