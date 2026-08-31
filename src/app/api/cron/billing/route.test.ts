import { beforeEach, describe, expect, mock, test } from 'bun:test'

const recurringCycle = mock(async () => ({ created: 1, skipped: 0, failed: 0 }))
const planChangeCycle = mock(async () => ({ applied: 1, skipped: 0, failed: 0 }))
const reminderCycle = mock(async () => ({ sent: 1, skipped: 0, failed: 0 }))
const delinquencyCycle = mock(async () => ({ blocked: 1, skipped: 0, failed: 0 }))
const gatewayQueueCycle = mock(async () => ({ processed: 1, skipped: 0, failed: 0 }))
const gatewayReconciliationCycle = mock(async () => ({
  checked: 1,
  divergences: 0,
}))

mock.module('@/features/billing/recurring-billing', () => ({
  runRecurringBillingCycle: recurringCycle,
}))

mock.module('@/features/internal-operations/db', () => ({
  applyDueStoreSubscriptionPlanChanges: planChangeCycle,
}))

mock.module('@/features/billing/billing-reminders', () => ({
  runBillingReminderCycle: reminderCycle,
}))

mock.module('@/features/billing/billing-delinquency-blocks', () => ({
  runBillingDelinquencyAccessBlockCycle: delinquencyCycle,
}))

mock.module('@/features/billing/gateway-webhooks', () => ({
  processBillingGatewayWebhookQueue: gatewayQueueCycle,
  runBillingGatewayReconciliationCycle: gatewayReconciliationCycle,
}))

const route = await import('./route')

function buildRequest(secret = 'cron-secret') {
  return new Request('https://clicaepedeofc.vercel.app/api/cron/billing', {
    headers: { authorization: `Bearer ${secret}` },
  })
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

describe('billing cron route', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret'
    process.env.BILLING_INVOICE_LEAD_DAYS = '5'
    process.env.BILLING_RECURRING_RUN_LIMIT = '7'

    recurringCycle.mockReset()
    planChangeCycle.mockReset()
    reminderCycle.mockReset()
    delinquencyCycle.mockReset()
    gatewayQueueCycle.mockReset()
    gatewayReconciliationCycle.mockReset()

    recurringCycle.mockImplementation(async () => ({
      created: 1,
      skipped: 0,
      failed: 0,
    }))
    planChangeCycle.mockImplementation(async () => ({
      applied: 1,
      skipped: 0,
      failed: 0,
    }))
    reminderCycle.mockImplementation(async () => ({
      sent: 1,
      skipped: 0,
      failed: 0,
    }))
    delinquencyCycle.mockImplementation(async () => ({
      blocked: 1,
      skipped: 0,
      failed: 0,
    }))
    gatewayQueueCycle.mockImplementation(async () => ({
      processed: 1,
      skipped: 0,
      failed: 0,
    }))
    gatewayReconciliationCycle.mockImplementation(async () => ({
      checked: 1,
      divergences: 0,
    }))
  })

  test('fails closed when the cron secret is not configured', async () => {
    delete process.env.CRON_SECRET

    const response = await route.GET(buildRequest())

    expect(response.status).toBe(503)
    expect(await readJson(response)).toEqual({
      ok: false,
      error: 'CRON_SECRET is required to run recurring billing safely.',
    })
    expect(recurringCycle).not.toHaveBeenCalled()
  })

  test('rejects requests without the expected bearer token', async () => {
    const response = await route.GET(buildRequest('wrong-secret'))

    expect(response.status).toBe(401)
    expect(await readJson(response)).toEqual({
      ok: false,
      error: 'Unauthorized',
    })
    expect(recurringCycle).not.toHaveBeenCalled()
  })

  test('runs every billing cycle with the configured limits', async () => {
    const response = await route.GET(buildRequest())
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(recurringCycle).toHaveBeenCalledWith({
      invoiceLeadDays: 5,
      limit: 7,
    })
    expect(planChangeCycle).toHaveBeenCalledWith({ limit: 7 })
    expect(reminderCycle).toHaveBeenCalledWith({ limit: 7 })
    expect(delinquencyCycle).toHaveBeenCalledWith({ limit: 7 })
    expect(gatewayQueueCycle).toHaveBeenCalledWith({ limit: 7 })
    expect(gatewayReconciliationCycle).toHaveBeenCalledWith({ limit: 7 })
  })

  test('reports ok false when a blocking cycle fails', async () => {
    reminderCycle.mockImplementation(async () => ({
      sent: 0,
      skipped: 0,
      failed: 1,
    }))

    const response = await route.GET(buildRequest())
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body.ok).toBe(false)
    expect(body.reminders).toEqual({ sent: 0, skipped: 0, failed: 1 })
  })

  test('reports ok false when gateway reconciliation finds divergences', async () => {
    gatewayReconciliationCycle.mockImplementation(async () => ({
      checked: 3,
      divergences: 1,
    }))

    const response = await route.GET(buildRequest())
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body.ok).toBe(false)
    expect(body.gatewayReconciliation).toEqual({
      checked: 3,
      divergences: 1,
    })
  })
})
