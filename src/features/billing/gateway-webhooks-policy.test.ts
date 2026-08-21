import { describe, expect, test } from 'bun:test'
import {
  normalizeBillingGatewayEvent,
  resolveBillingGatewayEventProcessing,
  signBillingGatewayWebhookPayload,
  verifyBillingGatewayWebhookSignature,
} from './gateway-webhooks-policy'

describe('billing gateway webhooks policy', () => {
  test('validates signed payloads with timestamp tolerance', () => {
    const rawBody = JSON.stringify({ id: 'evt_1', type: 'payment_succeeded' })
    const timestamp = '2026-08-21T15:00:00.000Z'
    const secret = 'gateway-secret'
    const signature = signBillingGatewayWebhookPayload({
      rawBody,
      timestamp,
      secret,
    })

    expect(
      verifyBillingGatewayWebhookSignature({
        rawBody,
        timestamp,
        signature: `sha256=${signature}`,
        secret,
        now: new Date('2026-08-21T15:02:00.000Z'),
      }).valid
    ).toBe(true)

    expect(
      verifyBillingGatewayWebhookSignature({
        rawBody,
        timestamp,
        signature,
        secret,
        now: new Date('2026-08-21T15:10:01.000Z'),
      })
    ).toEqual({ valid: false, reason: 'timestamp_outside_tolerance' })
  })

  test('maps paid, failure, refund and cancellation events', () => {
    const cases = [
      ['payment_confirmed', 'payment_succeeded'],
      ['payment_failed', 'payment_failed'],
      ['charge_refunded', 'payment_refunded'],
      ['payment_canceled', 'payment_cancelled'],
    ] as const

    for (const [rawType, expectedType] of cases) {
      const event = normalizeBillingGatewayEvent({
        rawBody: JSON.stringify({
          id: `evt_${rawType}`,
          type: rawType,
          data: {
            invoice_id: 10,
            provider_payment_id: `pay_${rawType}`,
            amount: '99.9',
          },
        }),
        providerFromHeader: 'ValidaPay',
      })

      expect(event.provider).toBe('validapay')
      expect(event.eventType).toBe(expectedType)
      expect(event.invoiceId).toBe(10)
      expect(event.amount).toBe('99.9000')
    }
  })

  test('keeps invoice state consistent when events arrive out of order', () => {
    const decision = resolveBillingGatewayEventProcessing({
      invoiceStatus: 'paid',
      eventType: 'payment_failed',
    })
    expect(decision.action).toBe('ignore')
    expect(decision.issueType).toBe('out_of_order_event')

    expect(
      resolveBillingGatewayEventProcessing({
        invoiceStatus: 'pending',
        eventType: 'payment_succeeded',
      })
    ).toEqual({ action: 'process' })
  })
})
