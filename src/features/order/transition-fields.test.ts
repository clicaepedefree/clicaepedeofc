import { describe, expect, test } from 'bun:test'
import { buildOrderTransitionPersistenceFields } from './transition-fields'

const now = new Date('2026-07-30T00:00:00.000Z')
const actorUserId = 'user_qa'

describe('order transition persistence fields', () => {
  test('does not complete orders when moving through operational statuses', () => {
    for (const action of ['start_preparation', 'mark_ready', 'dispatch'] as const) {
      const fields = buildOrderTransitionPersistenceFields({
        action,
        now,
        actorUserId,
        reason: null,
      })

      expect(fields.orderStatusFields).toEqual({})
      expect(fields.publicOrderStatusFields).toEqual({})
    }
  })

  test('sets completedAt only when completing the order', () => {
    const fields = buildOrderTransitionPersistenceFields({
      action: 'complete',
      now,
      actorUserId,
      reason: null,
    })

    expect(fields.orderStatusFields).toEqual({ completedAt: now })
    expect(fields.publicOrderStatusFields).toEqual({ completedAt: now })
  })

  test('keeps reject metadata without completing the order', () => {
    const fields = buildOrderTransitionPersistenceFields({
      action: 'reject',
      now,
      actorUserId,
      reason: 'Fora do horario',
    })

    expect(fields.orderStatusFields).toEqual({
      rejectedAt: now,
      rejectedByUserId: actorUserId,
      rejectionReason: 'Fora do horario',
    })
    expect(fields.publicOrderStatusFields).toEqual({
      rejectedAt: now,
      rejectedByUserId: actorUserId,
      rejectionReason: 'Fora do horario',
    })
  })

  test('keeps cancel metadata without completing the order', () => {
    const fields = buildOrderTransitionPersistenceFields({
      action: 'cancel',
      now,
      actorUserId,
      reason: 'Cliente desistiu',
    })

    expect(fields.orderStatusFields).toEqual({ cancelledAt: now })
    expect(fields.publicOrderStatusFields).toEqual({ cancelledAt: now })
  })

  test('keeps accept metadata and clamps the public estimate', () => {
    const fields = buildOrderTransitionPersistenceFields({
      action: 'accept',
      now,
      actorUserId,
      reason: null,
      estimatedMinutes: 999,
    })

    expect(fields.normalizedEstimatedMinutes).toBe(240)
    expect(fields.orderStatusFields).toEqual({
      acceptedAt: now,
      acceptedByUserId: actorUserId,
      deliveryEstimatedMinutes: 240,
      deliveryEta: new Date('2026-07-30T04:00:00.000Z'),
    })
    expect(fields.publicOrderStatusFields).toEqual({
      acceptedAt: now,
      acceptedByUserId: actorUserId,
    })
  })
})
