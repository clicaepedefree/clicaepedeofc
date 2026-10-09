import { describe, expect, mock, test } from 'bun:test'
import { authorizeWorkerRequest, matchesJobSecret } from './scheduled-job-policy'
import type { DbSession } from '@/services/db/types'

mock.module('@/services/db', () => ({ db: {} }))
const { withScheduledJobLock } = await import('./scheduled-job')

describe('scheduled jobs', () => {
  test('fails closed without dedicated credentials and rejects cross-job secrets', () => {
    const old = process.env.WHATSAPP_WORKER_SECRET
    delete process.env.WHATSAPP_WORKER_SECRET
    expect(authorizeWorkerRequest(new Request('https://fixture'), 'whatsapp')?.status).toBe(503)
    process.env.WHATSAPP_WORKER_SECRET = 'fixture-whatsapp'
    expect(authorizeWorkerRequest(new Request('https://fixture', { headers: { authorization: 'Bearer fixture-billing' } }), 'whatsapp')?.status).toBe(401)
    if (old === undefined) delete process.env.WHATSAPP_WORKER_SECRET
    else process.env.WHATSAPP_WORKER_SECRET = old
    expect(matchesJobSecret(null, 'fixture')).toBe(false)
    expect(matchesJobSecret('Bearer fixture', 'fixture')).toBe(true)
  })

  test('does not execute the callback when another transaction holds the lock', async () => {
    const run = mock(async () => 42)
    const database = { transaction: async (callback: (tx: unknown) => unknown) => callback({ execute: async () => [{ acquired: false }] }) } as unknown as Pick<DbSession, 'transaction'>
    expect(await withScheduledJobLock('whatsapp', run, database)).toEqual({ acquired: false })
    expect(run).not.toHaveBeenCalled()
  })

  test('holds the transaction open until the callback settles and propagates failure', async () => {
    let finished = false
    const database = { transaction: async (callback: (tx: unknown) => unknown) => {
      try { return await callback({ execute: async () => [{ acquired: true }] }) }
      finally { finished = true }
    } } as unknown as Pick<DbSession, 'transaction'>
    expect(await withScheduledJobLock('billing', async () => { expect(finished).toBe(false); return 42 }, database)).toEqual({ acquired: true, result: 42 })
    expect(finished).toBe(true)
    await expect(withScheduledJobLock('billing', async () => { throw new Error('fixture-failure') }, database)).rejects.toThrow('fixture-failure')
  })
})
