import { describe, expect, test } from 'bun:test'
import {
  requireAuditReason,
  resolveOrderTransition,
  sanitizeOrderAuditMetadata,
  toOrderAuditEventDto,
} from './audit-policy'

const throws = (callback: () => unknown) => {
  try {
    callback()
    return false
  } catch {
    return true
  }
}

describe('order audit policy', () => {
  test('resolves allowed transitions', () => {
    expect(resolveOrderTransition('PENDING', 'accept')).toEqual({
      fromStatus: 'PENDING',
      toStatus: 'ACCEPTED',
      reason: null,
    })
    expect(resolveOrderTransition('ACCEPTED', 'complete').toStatus).toBe('COMPLETED')
    expect(resolveOrderTransition('ACCEPTED', 'start_preparation').toStatus).toBe('IN_PREPARATION')
    expect(resolveOrderTransition('IN_PREPARATION', 'mark_ready').toStatus).toBe('READY')
    expect(resolveOrderTransition('READY', 'dispatch').toStatus).toBe('OUT_FOR_DELIVERY')
    expect(resolveOrderTransition('OUT_FOR_DELIVERY', 'complete').toStatus).toBe('COMPLETED')
  })

  test('keeps terminal statuses immutable', () => {
    for (const status of ['COMPLETED', 'CANCELLED', 'REJECTED'] as const) {
      expect(throws(() => resolveOrderTransition(status, 'cancel', 'teste'))).toBe(true)
    }
  })

  test('requires a reason for reject and cancel', () => {
    expect(throws(() => resolveOrderTransition('PENDING', 'reject', '  '))).toBe(true)
    expect(throws(() => resolveOrderTransition('ACCEPTED', 'cancel'))).toBe(true)
  })

  test('requires a non-empty audit note', () => {
    expect(throws(() => requireAuditReason('  '))).toBe(true)
    expect(requireAuditReason('  cliente ligou  ')).toBe('cliente ligou')
  })

  test('rejects sensitive data in immutable reasons and notes', () => {
    expect(throws(() => requireAuditReason('Cliente: pessoa@exemplo.com'))).toBe(true)
    expect(throws(() => requireAuditReason('Telefone 11 99999-9999'))).toBe(true)
    expect(throws(() => resolveOrderTransition('PENDING', 'reject', 'CPF 123.456.789-00'))).toBe(true)
  })

  test('whitelists metadata and removes nested PII', () => {
    expect(
      sanitizeOrderAuditMetadata({
        salesChannel: 'DIGITAL_MENU',
        displayId: '42',
        phone: '11999999999',
        customer: { cpf: '123', address: { street: 'Rua A' } },
        payload: { userAgent: 'raw' },
      })
    ).toEqual({ salesChannel: 'DIGITAL_MENU', displayId: '42' })
  })

  test('builds an event DTO without hashes or arbitrary payloads', () => {
    const dto = toOrderAuditEventDto({
      id: 1,
      eventType: 'order_created',
      fromStatus: null,
      toStatus: 'PENDING',
      actorType: 'customer',
      actorUserId: null,
      origin: 'DIGITAL_MENU',
      reason: null,
      requestId: 'request-1',
      metadata: { orderType: 'DELIVERY', phone: '11999999999' },
      createdAt: new Date('2026-01-01T00:00:00Z'),
    })

    expect(dto.metadata).toEqual({ orderType: 'DELIVERY' })
    expect('ipHash' in dto).toBe(false)
    expect('userAgentHash' in dto).toBe(false)
    expect('payload' in dto).toBe(false)
    expect('actorUserId' in dto).toBe(false)
    expect('requestId' in dto).toBe(false)
  })
})
