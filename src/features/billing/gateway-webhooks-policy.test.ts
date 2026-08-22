import { describe, expect, test } from 'bun:test'
import {
  normalizeBillingGatewayProvider,
  normalizeBillingGatewayEvent,
  resolveAllowedBillingGatewayProviders,
  resolveBillingGatewayEventProcessing,
  signBillingGatewayWebhookPayload,
  verifyBillingGatewayWebhookSignature,
} from './gateway-webhooks-policy'
import { buildPaymentConfirmationDedupeKey } from './payment-confirmation-policy'

describe('billing gateway webhooks policy', () => {
  test('normalizes provider allowlist without accepting empty entries', () => {
    expect(normalizeBillingGatewayProvider(' Valida Pay ')).toBe('valida_pay')
    expect(normalizeBillingGatewayProvider(null)).toBe('generic_gateway')

    expect(resolveAllowedBillingGatewayProviders(undefined)).toEqual([
      'validapay',
      'generic_gateway',
    ])
    expect(
      resolveAllowedBillingGatewayProviders(' Valida Pay, , Custom.Provider ')
    ).toEqual(['valida_pay', 'custom_provider'])
    expect(resolveAllowedBillingGatewayProviders(' , ')).toEqual([])
  })

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

  test('uses deterministic provider event ids for repeated webhook payloads', () => {
    const rawBody = JSON.stringify({
      type: 'payment_succeeded',
      data: {
        invoice_id: 10,
        provider_payment_id: ' pay_duplicado ',
        amount: '20.00',
      },
    })

    const firstEvent = normalizeBillingGatewayEvent({
      rawBody,
      providerFromHeader: 'ValidaPay',
    })
    const repeatedEvent = normalizeBillingGatewayEvent({
      rawBody,
      providerFromHeader: 'ValidaPay',
    })

    expect(firstEvent.providerEventId).toBe(repeatedEvent.providerEventId)
    expect(firstEvent.providerEventId).toStartWith('validapay:')
    expect(firstEvent.providerPaymentId).toBe('pay_duplicado')
  })

  test('keeps repeated payment dedupe stable when webhook payload shape changes', () => {
    const firstEvent = normalizeBillingGatewayEvent({
      rawBody: JSON.stringify({
        id: 'evt_primeiro',
        type: 'payment_succeeded',
        data: {
          invoice_id: 10,
          provider_payment_id: 'pay_mesmo_pagamento',
          amount: '20.00',
          paidAt: '2026-08-21T12:00:00.000Z',
        },
      }),
      providerFromHeader: 'ValidaPay',
    })
    const repeatedEvent = normalizeBillingGatewayEvent({
      rawBody: JSON.stringify({
        event_id: 'evt_repetido_com_payload_diferente',
        status: 'paid',
        provider: 'ValidaPay',
        amount: 20,
        invoice_id: 10,
        providerPaymentId: ' pay_mesmo_pagamento ',
        paidAt: '2026-08-21T12:05:00.000Z',
      }),
      providerFromHeader: null,
    })

    expect(firstEvent.providerEventId).not.toBe(repeatedEvent.providerEventId)
    expect(
      buildPaymentConfirmationDedupeKey({
        invoiceId: firstEvent.invoiceId ?? 0,
        provider: firstEvent.provider,
        providerPaymentId: firstEvent.providerPaymentId,
        amount: firstEvent.amount ?? '0',
        paidAt: firstEvent.occurredAt,
      })
    ).toBe(
      buildPaymentConfirmationDedupeKey({
        invoiceId: repeatedEvent.invoiceId ?? 0,
        provider: repeatedEvent.provider,
        providerPaymentId: repeatedEvent.providerPaymentId,
        amount: repeatedEvent.amount ?? '0',
        paidAt: repeatedEvent.occurredAt,
      })
    )
  })

  test('keeps invoice state consistent when events arrive out of order', () => {
    const outOfOrderCases = [
      ['paid', 'payment_failed'],
      ['paid', 'payment_cancelled'],
      ['cancelled', 'payment_succeeded'],
      ['refunded', 'payment_succeeded'],
    ] as const

    for (const [invoiceStatus, eventType] of outOfOrderCases) {
      const decision = resolveBillingGatewayEventProcessing({
        invoiceStatus,
        eventType,
      })
      expect(decision.action).toBe('ignore')
      expect(decision.issueType).toBe('out_of_order_event')
    }

    expect(
      resolveBillingGatewayEventProcessing({
        invoiceStatus: 'pending',
        eventType: 'payment_succeeded',
      })
    ).toEqual({ action: 'process' })

    expect(
      resolveBillingGatewayEventProcessing({
        invoiceStatus: 'pending',
        eventType: 'unknown',
      })
    ).toMatchObject({
      action: 'ignore',
      issueType: 'unsupported_event',
    })
  })
})
