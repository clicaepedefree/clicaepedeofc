import {
  enqueueBillingGatewayWebhook,
  processBillingGatewayWebhookQueue,
  recordInvalidBillingGatewayWebhook,
} from '@/features/billing/gateway-webhooks'
import {
  normalizeBillingGatewayProvider,
  resolveAllowedBillingGatewayProviders,
  verifyBillingGatewayWebhookSignature,
} from '@/features/billing/gateway-webhooks-policy'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const rawBody = await request.text()
  const rawProvider = request.headers.get('x-billing-provider')
  const provider = normalizeBillingGatewayProvider(rawProvider)
  const allowedProviders = resolveAllowedBillingGatewayProviders(
    process.env.BILLING_GATEWAY_ALLOWED_PROVIDERS
  )

  if (!rawProvider || !allowedProviders.includes(provider)) {
    await recordInvalidBillingGatewayWebhook({
      rawBody,
      headers: request.headers,
      provider,
      reason: 'invalid_origin',
      signatureStatus: 'valid',
      issueType: 'invalid_origin',
    })

    return NextResponse.json(
      { accepted: false, reason: 'invalid_origin' },
      { status: 403 }
    )
  }

  const verification = verifyBillingGatewayWebhookSignature({
    rawBody,
    timestamp: request.headers.get('x-clica-timestamp'),
    signature: request.headers.get('x-clica-signature'),
    secret: process.env.BILLING_GATEWAY_WEBHOOK_SECRET,
  })

  if (!verification.valid) {
    await recordInvalidBillingGatewayWebhook({
      rawBody,
      headers: request.headers,
      provider,
      reason: verification.reason,
    })

    return NextResponse.json(
      { accepted: false, reason: verification.reason },
      { status: 401 }
    )
  }

  const event = await enqueueBillingGatewayWebhook({
    rawBody,
    headers: request.headers,
  })

  if (!event.duplicate) {
    await processBillingGatewayWebhookQueue({ limit: 1 })
  }

  return NextResponse.json(
    { accepted: true, duplicate: event.duplicate ?? false },
    { status: event.duplicate ? 200 : 202 }
  )
}
