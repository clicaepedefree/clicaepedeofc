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

  test('does not execute the callback when another owner holds the reservation', async () => {
    const run = mock(async () => 42)
    const database = { execute: async () => [] } as unknown as Pick<DbSession, 'execute'>
    expect(await withScheduledJobLock('whatsapp', run, database)).toEqual({ acquired: false })
    expect(run).not.toHaveBeenCalled()
  })

  test('does not release the durable lease before work settles, even across transient connection loss', async () => {
    const { PgDialect } = await import('drizzle-orm/pg-core')
    const dialect = new PgDialect()
    let owner: string | null = null
    let releaseCount = 0
    const database = { execute: async (query: Parameters<typeof dialect.sqlToQuery>[0]) => {
      const parsed = dialect.sqlToQuery(query)
      if (parsed.sql.includes('insert into')) {
        if (owner) return []
        owner = String(parsed.params[1])
        return [{ owner }]
      }
      releaseCount += 1
      owner = null
      return []
    } } as unknown as Pick<DbSession, 'execute'>
    expect(await withScheduledJobLock('billing', async () => {
      expect(releaseCount).toBe(0)
      expect(await withScheduledJobLock('billing', async () => 99, database)).toEqual({ acquired: false })
      return 42
    }, database)).toEqual({ acquired: true, result: 42 })
    expect(releaseCount).toBe(1)
    await expect(withScheduledJobLock('billing', async () => { throw new Error('fixture-failure') }, database)).rejects.toThrow('fixture-failure')
    expect(releaseCount).toBe(2)
  })

  test('does not start work if acquisition acknowledgement is lost', async () => {
    const run = mock(async () => 42)
    const database = { execute: async () => { throw new Error('fixture-connection-loss') } } as unknown as Pick<DbSession, 'execute'>
    await expect(withScheduledJobLock('billing', run, database)).rejects.toThrow('fixture-connection-loss')
    expect(run).not.toHaveBeenCalled()
  })
})
