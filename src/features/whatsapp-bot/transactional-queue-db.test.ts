import { afterEach, describe, expect, mock, test } from 'bun:test'
import type { DbSession } from '@/services/db/types'

mock.module('@/services/db', () => ({ db: {} }))
const { enqueueWhatsappTransactionalMessage } = await import('./db')
const originalMode = process.env.WHATSAPP_BOT_ROLLOUT_MODE

afterEach(() => {
  if (originalMode === undefined) delete process.env.WHATSAPP_BOT_ROLLOUT_MODE
  else process.env.WHATSAPP_BOT_ROLLOUT_MODE = originalMode
})

describe('transactional queue database contract', () => {
  test('persists E.164 while keeping equivalent recipients idempotent', async () => {
    process.env.WHATSAPP_BOT_ROLLOUT_MODE = 'all'
    const persisted = new Map<string, Record<string, unknown>>()
    const attempts: Record<string, unknown>[] = []
    const dbSession = {
      insert: () => ({
        values: (values: Record<string, unknown>) => {
          attempts.push(values)
          return {
            onConflictDoNothing: () => ({
              returning: async () => {
                const key = `${values.storeId}:${values.idempotencyKey}`
                if (persisted.has(key)) return []
                persisted.set(key, values)
                return [{ id: 'qa-event' }]
              },
            }),
          }
        },
      }),
    } as unknown as DbSession
    const input = {
      dbSession, storeId: 9, eventType: 'manual' as const,
      eventId: 'qa-e164-contract', text: 'Fixed QA text',
      payload: { notificationCategory: 'transactional' },
    }

    const first = await enqueueWhatsappTransactionalMessage({ ...input, recipientPhone: '+55 (11) 90000-0001' })
    const replay = await enqueueWhatsappTransactionalMessage({ ...input, recipientPhone: '5511900000001' })

    expect(attempts.map(value => value.recipientPhone)).toEqual(['+5511900000001', '+5511900000001'])
    expect(first.accepted).toBe(true)
    expect(replay.duplicate).toBe(true)
    expect(replay.accepted).toBe(false)
    expect(replay.idempotencyKey).toBe(first.idempotencyKey)
    expect(persisted.size).toBe(1)
  })
})
