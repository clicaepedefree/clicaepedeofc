import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { authorizeWorkerRequest, jobAlreadyRunning, matchesJobSecret } from '@/shared/lib/scheduled-job-policy'

const jobLock = mock(async (_job: string, run: () => Promise<Response>) => ({ acquired: true, result: await run() }))
mock.module('@/shared/lib/scheduled-job', () => ({ authorizeWorkerRequest, jobAlreadyRunning, matchesJobSecret, withScheduledJobLock: jobLock }))

const processQueue = mock(async () => ({
  processed: 1,
  sent: 1,
  failed: 0,
  discarded: 0,
}))

mock.module('@/features/whatsapp-bot/db', () => ({
  processWhatsappTransactionalQueue: processQueue,
}))

const { GET, POST } = await import('./route')

const buildRequest = (secret = 'cron-secret') =>
  new Request(
    'https://clicaepedeofc.vercel.app/api/cron/whatsapp/transactional',
    {
      headers: {
        authorization: `Bearer ${secret}`,
      },
    }
  )

describe('whatsapp transactional cron route', () => {
  const originalCronSecret = process.env.CRON_SECRET

  beforeEach(() => {
    process.env.CRON_SECRET = 'cron-secret'
    process.env.WHATSAPP_WORKER_SECRET = 'fixture-whatsapp-worker'
    jobLock.mockImplementation(async (_job, run) => ({ acquired: true, result: await run() }))
    processQueue.mockReset()
    processQueue.mockImplementation(async () => ({
      processed: 1,
      sent: 1,
      failed: 0,
      discarded: 0,
    }))
  })

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET
    } else {
      process.env.CRON_SECRET = originalCronSecret
    }
  })

  test('rejects requests without the expected bearer token', async () => {
    const response = await GET(buildRequest('wrong-secret'))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'Unauthorized WhatsApp transactional queue run.',
    })
    expect(processQueue).not.toHaveBeenCalled()
  })

  test('worker POST rejects legacy credentials and accepts its dedicated secret', async () => {
    expect((await POST(buildRequest())).status).toBe(401)
    expect((await POST(buildRequest('fixture-whatsapp-worker'))).status).toBe(200)
  })

  test('does not touch the queue when the distributed lock is held', async () => {
    jobLock.mockImplementation(async () => ({ acquired: false, result: undefined as unknown as Response }))
    expect((await GET(buildRequest())).status).toBe(409)
    expect(processQueue).not.toHaveBeenCalled()
  })

  test('fails closed when the cron secret is missing', async () => {
    delete process.env.CRON_SECRET

    const response = await GET(buildRequest())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'CRON_SECRET is required to run WhatsApp transactional queue.',
    })
    expect(processQueue).not.toHaveBeenCalled()
  })

  test('processes the transactional queue and reports counters', async () => {
    const response = await GET(buildRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      processed: 1,
      sent: 1,
      failed: 0,
      discarded: 0,
    })
    expect(processQueue).toHaveBeenCalledTimes(1)
  })

  test('keeps diagnostics visible when permanent failures are discarded', async () => {
    processQueue.mockImplementation(async () => ({
      processed: 1,
      sent: 0,
      failed: 0,
      discarded: 1,
    }))

    const response = await GET(buildRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: false,
      processed: 1,
      sent: 0,
      failed: 0,
      discarded: 1,
    })
  })
})
