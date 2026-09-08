import { describe, expect, test } from 'bun:test'

import {
  buildWhatsappTransactionalIdempotencyKey,
  isWhatsappTransactionalEventDue,
  normalizeWhatsappTransactionalQueueLimit,
  readWhatsappTransactionalTextPayload,
  resolveWhatsappTransactionalDeliveryDecision,
} from './transactional-queue-policy'

describe('whatsapp transactional queue policy', () => {
  test('builds deterministic idempotency by event type, event id and recipient', () => {
    const first = buildWhatsappTransactionalIdempotencyKey({
      eventType: 'order_status',
      eventId: 'order-10:accepted',
      recipientPhone: '+55 (13) 99184-0862',
    })
    const replay = buildWhatsappTransactionalIdempotencyKey({
      eventType: 'order_status',
      eventId: 'order-10:accepted',
      recipientPhone: '5513991840862',
    })
    const otherRecipient = buildWhatsappTransactionalIdempotencyKey({
      eventType: 'order_status',
      eventId: 'order-10:accepted',
      recipientPhone: '5513991840000',
    })

    expect(replay).toBe(first)
    expect(otherRecipient).not.toBe(first)
  })

  test('normalizes queue limits and message payloads', () => {
    expect(normalizeWhatsappTransactionalQueueLimit(undefined)).toBe(25)
    expect(normalizeWhatsappTransactionalQueueLimit(999)).toBe(100)
    expect(readWhatsappTransactionalTextPayload({ text: '  oi  ' })).toBe('oi')
    expect(() => readWhatsappTransactionalTextPayload({ text: '' })).toThrow(
      'WHATSAPP_TRANSACTIONAL_EMPTY_TEXT'
    )
  })

  test('retries temporary and disconnected failures without infinite loop', () => {
    const now = new Date('2026-09-08T12:00:00.000Z')

    const disconnected = resolveWhatsappTransactionalDeliveryDecision({
      now,
      attempts: 1,
      maxAttempts: 4,
      error: new Error('WHATSAPP_TRANSACTIONAL_SESSION_DISCONNECTED'),
    })
    expect(disconnected).toMatchObject({
      status: 'failed',
      attemptStatus: 'skipped',
      shouldRetry: true,
      errorCode: 'session_disconnected',
    })
    expect(disconnected.nextAttemptAt?.toISOString()).toBe(
      '2026-09-08T12:01:00.000Z'
    )

    const exhausted = resolveWhatsappTransactionalDeliveryDecision({
      now,
      attempts: 4,
      maxAttempts: 4,
      error: new Error('WHATSAPP_TRANSACTIONAL_SESSION_DISCONNECTED'),
    })
    expect(exhausted).toMatchObject({
      status: 'failed',
      attemptStatus: 'skipped',
      shouldRetry: false,
      nextAttemptAt: null,
    })
  })

  test('discards permanent failures and marks successful deliveries', () => {
    const now = new Date('2026-09-08T12:00:00.000Z')

    expect(
      resolveWhatsappTransactionalDeliveryDecision({
        now,
        attempts: 1,
        maxAttempts: 4,
      })
    ).toMatchObject({
      status: 'sent',
      attemptStatus: 'succeeded',
      shouldRetry: false,
    })

    expect(
      resolveWhatsappTransactionalDeliveryDecision({
        now,
        attempts: 1,
        maxAttempts: 4,
        error: new Error('WHATSAPP_TRANSACTIONAL_EMPTY_TEXT'),
      })
    ).toMatchObject({
      status: 'discarded',
      attemptStatus: 'failed',
      shouldRetry: false,
    })
  })

  test('selects only due queued or failed events below max attempts', () => {
    const now = new Date('2026-09-08T12:00:00.000Z')
    expect(
      isWhatsappTransactionalEventDue({
        now,
        event: {
          status: 'failed',
          attempts: 2,
          maxAttempts: 4,
          nextAttemptAt: new Date('2026-09-08T11:59:00.000Z'),
        },
      })
    ).toBe(true)

    expect(
      isWhatsappTransactionalEventDue({
        now,
        event: {
          status: 'failed',
          attempts: 4,
          maxAttempts: 4,
          nextAttemptAt: new Date('2026-09-08T11:59:00.000Z'),
        },
      })
    ).toBe(false)
  })
})
