import { beforeEach, describe, expect, mock, test } from 'bun:test'
import { signBillingGatewayWebhookPayload } from '@/features/billing/gateway-webhooks-policy'

const recordInvalidWebhook = mock(async () => ({ accepted: false }))
const enqueueWebhook = mock(async () => ({ accepted: true, duplicate: false }))
const processWebhookQueue = mock(async () => ({
  processed: 1,
  skipped: 0,
  failed: 0,
}))

mock.module('@/features/billing/gateway-webhooks', () => ({
  recordInvalidBillingGatewayWebhook: recordInvalidWebhook,
  enqueueBillingGatewayWebhook: enqueueWebhook,
  processBillingGatewayWebhookQueue: processWebhookQueue,
}))

mock.module('@/features/billing/gateway-webhooks.ts', () => ({
  recordInvalidBillingGatewayWebhook: recordInvalidWebhook,
  enqueueBillingGatewayWebhook: enqueueWebhook,
  processBillingGatewayWebhookQueue: processWebhookQueue,
}))

const route = await import('./route')

const rawBody = JSON.stringify({
  id: 'evt_kan114',
  type: 'payment_succeeded',
  data: {
    invoice_id: 10,
    amount: '99.90',
  },
})

function buildSignedRequest({
  provider = 'validapay',
  secret = 'gateway-secret',
  timestamp = new Date().toISOString(),
  signature,
  body = rawBody,
}: {
  provider?: string
  secret?: string
  timestamp?: string
  signature?: string
  body?: string
} = {}) {
  const resolvedSignature =
    signature ??
    signBillingGatewayWebhookPayload({
      rawBody: body,
      timestamp,
      secret,
    })

  return new Request('https://clicaepedeofc.vercel.app/api/webhooks/billing', {
    method: 'POST',
    headers: {
      'x-billing-provider': provider,
      'x-clica-timestamp': timestamp,
      'x-clica-signature': `sha256=${resolvedSignature}`,
    },
    body,
  })
}

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

describe('billing webhook route', () => {
  beforeEach(() => {
    process.env.BILLING_GATEWAY_ALLOWED_PROVIDERS = 'validapay,generic_gateway'
    process.env.BILLING_GATEWAY_WEBHOOK_SECRET = 'gateway-secret'

    recordInvalidWebhook.mockReset()
    enqueueWebhook.mockReset()
    processWebhookQueue.mockReset()

    recordInvalidWebhook.mockImplementation(async () => ({ accepted: false }))
    enqueueWebhook.mockImplementation(async () => ({
      accepted: true,
      duplicate: false,
    }))
    processWebhookQueue.mockImplementation(async () => ({
      processed: 1,
      skipped: 0,
      failed: 0,
    }))
  })

  test('records and rejects webhooks from providers outside the allowlist', async () => {
    const response = await route.POST(
      buildSignedRequest({ provider: 'untrusted_gateway' })
    )

    expect(response.status).toBe(403)
    expect(await readJson(response)).toEqual({
      accepted: false,
      reason: 'invalid_origin',
    })
    expect(recordInvalidWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        rawBody,
        provider: 'untrusted_gateway',
        reason: 'invalid_origin',
        signatureStatus: 'valid',
        issueType: 'invalid_origin',
      })
    )
    expect(enqueueWebhook).not.toHaveBeenCalled()
  })

  test('records and rejects invalid signatures before queueing', async () => {
    const response = await route.POST(
      buildSignedRequest({ signature: 'deadbeef' })
    )

    expect(response.status).toBe(401)
    expect(await readJson(response)).toEqual({
      accepted: false,
      reason: 'signature_mismatch',
    })
    expect(recordInvalidWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        rawBody,
        provider: 'validapay',
        reason: 'signature_mismatch',
      })
    )
    expect(enqueueWebhook).not.toHaveBeenCalled()
  })

  test('queues and processes a valid new webhook asynchronously', async () => {
    const response = await route.POST(buildSignedRequest())

    expect(response.status).toBe(202)
    expect(await readJson(response)).toEqual({
      accepted: true,
      duplicate: false,
    })
    expect(enqueueWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ rawBody })
    )
    expect(processWebhookQueue).toHaveBeenCalledWith({ limit: 1 })
  })

  test('acknowledges duplicate webhooks without reprocessing the queue', async () => {
    enqueueWebhook.mockImplementation(async () => ({
      accepted: true,
      duplicate: true,
    }))

    const response = await route.POST(buildSignedRequest())

    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({
      accepted: true,
      duplicate: true,
    })
    expect(processWebhookQueue).not.toHaveBeenCalled()
  })

  test('fails closed when the webhook secret is missing', async () => {
    delete process.env.BILLING_GATEWAY_WEBHOOK_SECRET

    const response = await route.POST(buildSignedRequest())

    expect(response.status).toBe(401)
    expect(await readJson(response)).toEqual({
      accepted: false,
      reason: 'secret_not_configured',
    })
    expect(recordInvalidWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'secret_not_configured',
      })
    )
    expect(enqueueWebhook).not.toHaveBeenCalled()
  })
})
