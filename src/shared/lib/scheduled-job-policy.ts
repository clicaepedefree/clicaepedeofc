import { timingSafeEqual } from 'node:crypto'

export type ScheduledJob = 'billing' | 'whatsapp'

export function matchesJobSecret(header: string | null, secret: string | undefined) {
  if (!secret || !header) return false
  const actual = Buffer.from(header)
  const expected = Buffer.from(`Bearer ${secret}`)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function authorizeWorkerRequest(request: Request, job: ScheduledJob) {
  const secret = job === 'billing'
    ? process.env.BILLING_WORKER_SECRET
    : process.env.WHATSAPP_WORKER_SECRET
  if (!secret) return Response.json({ ok: false, error: 'Worker secret is not configured.' }, { status: 503 })
  if (!matchesJobSecret(request.headers.get('authorization'), secret)) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export const jobAlreadyRunning = () => Response.json(
  { ok: true, skipped: true, reason: 'job_already_running' },
  { status: 409 }
)
