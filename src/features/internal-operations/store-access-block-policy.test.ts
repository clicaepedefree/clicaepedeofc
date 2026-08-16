import { describe, expect, test } from 'bun:test'
import {
  isStoreAccessBlockActive,
  storeAccessBlockActionSchema,
  storeAccessUnblockActionSchema,
  validateStoreAccessBlockSchedule,
} from './store-access-block-policy'

describe('store access block policy', () => {
  test('detects active manual blocks without changing commercial status', () => {
    const now = new Date('2026-08-16T12:00:00.000Z')

    expect(
      isStoreAccessBlockActive(
        { id: 1, unblockedAt: null, scheduledUnblockAt: null },
        now
      )
    ).toBe(true)
    expect(
      isStoreAccessBlockActive(
        {
          id: 1,
          unblockedAt: null,
          scheduledUnblockAt: new Date('2026-08-16T13:00:00.000Z'),
        },
        now
      )
    ).toBe(true)
    expect(
      isStoreAccessBlockActive(
        {
          id: 1,
          unblockedAt: null,
          scheduledUnblockAt: new Date('2026-08-16T11:59:00.000Z'),
        },
        now
      )
    ).toBe(false)
    expect(
      isStoreAccessBlockActive(
        {
          id: 1,
          unblockedAt: new Date('2026-08-16T11:00:00.000Z'),
          scheduledUnblockAt: null,
        },
        now
      )
    ).toBe(false)
  })

  test('requires justification and future schedule for blocking', () => {
    const parsed = storeAccessBlockActionSchema.parse({
      storeId: '42',
      reason: 'Risco operacional em analise pelo suporte.',
      notifyStoreOwner: 'true',
      notificationNote: 'Avisar cliente pelo WhatsApp.',
      scheduledUnblockAt: '2026-08-17T10:00',
    })

    expect(parsed.storeId).toBe(42)
    expect(parsed.notifyStoreOwner).toBe(true)
    expect(parsed.scheduledUnblockAt instanceof Date).toBe(true)
    expect(
      validateStoreAccessBlockSchedule({
        scheduledUnblockAt: parsed.scheduledUnblockAt,
        now: new Date('2026-08-16T10:00:00.000Z'),
      })
    ).toBe(null)
    expect(
      validateStoreAccessBlockSchedule({
        scheduledUnblockAt: new Date('2026-08-15T10:00:00.000Z'),
        now: new Date('2026-08-16T10:00:00.000Z'),
      })
    ).toBe('STORE_ACCESS_BLOCK_SCHEDULE_IN_PAST')
  })

  test('requires justification for manual unblock', () => {
    const invalidResult = storeAccessUnblockActionSchema.safeParse({
        storeId: 42,
        reason: 'ok',
      })

    expect(invalidResult.success).toBe(false)
    expect(
      storeAccessUnblockActionSchema.parse({
        storeId: 42,
        reason: 'Pendencia validada pelo suporte.',
      }).reason
    ).toBe('Pendencia validada pelo suporte.')
  })
})
