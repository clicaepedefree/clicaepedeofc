import { describe, expect, test } from 'bun:test'

import {
  assertWhatsappWebhookAuthorized,
  buildEvolutionInstanceName,
  normalizeEvolutionConnectionDecision,
  resolveReconnectPlan,
  resolveQrCodeExpiresAt,
  shouldApplyEvolutionSessionEvent,
} from './session-policy'

describe('whatsapp bot session policy', () => {
  test('builds deterministic provider instance names scoped by store and number', () => {
    expect(buildEvolutionInstanceName({ storeId: 9, numberId: 12 })).toBe(
      'clica-store-9-wa-12'
    )
  })

  test('maps open Evolution state to connected session', () => {
    const decision = normalizeEvolutionConnectionDecision({ state: 'open' })
    expect(decision.status).toBe('connected')
    expect(decision.numberStatus).toBe('active')
    expect(decision.action).toBe('none')
  })

  test('keeps QR state pending while Evolution is connecting', () => {
    const decision = normalizeEvolutionConnectionDecision({
      state: 'connecting',
    })
    expect(decision.status).toBe('pending_qr')
    expect(decision.numberStatus).toBe('inactive')
    expect(decision.action).toBe('none')
  })

  test('keeps pure QR update events pending even when no state is present', () => {
    const decision = normalizeEvolutionConnectionDecision({
      state: null,
      hasQrCode: true,
    })
    expect(decision.status).toBe('pending_qr')
    expect(decision.numberStatus).toBe('inactive')
    expect(decision.errorCode).toBe(null)
  })

  test('requests a new QR code for invalid sessions', () => {
    const decision = normalizeEvolutionConnectionDecision({
      state: 'close',
      reason: 'logged_out',
    })
    expect(decision.status).toBe('pending_qr')
    expect(decision.numberStatus).toBe('disconnected')
    expect(decision.action).toBe('request_new_qr')
    expect(decision.errorCode).toBe('session_invalid')
  })

  test('schedules controlled reconnect for temporary drops', () => {
    const decision = normalizeEvolutionConnectionDecision({
      state: 'close',
      reason: 'connection_lost',
    })
    expect(decision.status).toBe('connecting')
    expect(decision.numberStatus).toBe('disconnected')
    expect(decision.action).toBe('schedule_reconnect')
    expect(decision.errorCode).toBe('temporary_disconnect')
  })

  test('rejects unknown provider states with an explicit error state', () => {
    const decision = normalizeEvolutionConnectionDecision({ state: 'mystery' })
    expect(decision.status).toBe('error')
    expect(decision.numberStatus).toBe('error')
    expect(decision.errorCode).toBe('unknown_state')
  })

  test('uses a minimum QR code TTL to avoid immediately expired QR codes', () => {
    const now = new Date('2026-09-01T12:00:00.000Z')

    expect(resolveQrCodeExpiresAt({ now, ttlSeconds: 2 }).toISOString()).toBe(
      '2026-09-01T12:00:15.000Z'
    )
  })

  test('limits reconnect attempts with cooldown and max attempts', () => {
    const now = new Date('2026-09-01T12:00:00.000Z')

    expect(resolveReconnectPlan({ now }).shouldAttempt).toBe(true)
    expect(
      resolveReconnectPlan({
        now,
        lastAttemptAt: new Date('2026-09-01T11:59:30.000Z'),
        attemptCount: 1,
      }).reason
    ).toBe('cooldown_active')
    expect(
      resolveReconnectPlan({
        now,
        lastAttemptAt: new Date('2026-09-01T11:50:00.000Z'),
        attemptCount: 5,
      }).reason
    ).toBe('max_attempts_reached')
  })

  test('ignores stale provider events after manual pause or disconnect', () => {
    expect(
      shouldApplyEvolutionSessionEvent({
        currentStatus: 'paused',
        hasQrCode: false,
        nextStatus: 'connected',
      })
    ).toBe(false)
    expect(
      shouldApplyEvolutionSessionEvent({
        currentStatus: 'disconnected',
        hasQrCode: true,
        nextStatus: 'pending_qr',
      })
    ).toBe(false)
  })

  test('does not let stale QR events regress a connected session', () => {
    expect(
      shouldApplyEvolutionSessionEvent({
        currentStatus: 'connected',
        hasQrCode: true,
        nextStatus: 'pending_qr',
      })
    ).toBe(false)
  })

  test('accepts webhook bearer or explicit secret headers only when configured', () => {
    expect(
      assertWhatsappWebhookAuthorized({
        authorizationHeader: 'Bearer secret',
        explicitSecretHeader: null,
        expectedSecret: 'secret',
      })
    ).toBe(true)
    expect(
      assertWhatsappWebhookAuthorized({
        authorizationHeader: null,
        explicitSecretHeader: 'secret',
        expectedSecret: 'secret',
      })
    ).toBe(true)
    expect(
      assertWhatsappWebhookAuthorized({
        authorizationHeader: 'Bearer wrong',
        explicitSecretHeader: null,
        expectedSecret: 'secret',
      })
    ).toBe(false)
    expect(
      assertWhatsappWebhookAuthorized({
        authorizationHeader: 'Bearer secret',
        explicitSecretHeader: null,
        expectedSecret: undefined,
      })
    ).toBe(false)
  })
})
