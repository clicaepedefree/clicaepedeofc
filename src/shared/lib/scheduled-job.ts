import { sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '@/services/db'
import type { DbSession } from '@/services/db/types'

import type { ScheduledJob } from './scheduled-job-policy'
export { authorizeWorkerRequest, matchesJobSecret, jobAlreadyRunning } from './scheduled-job-policy'
// The durable reservation outlives a dropped DB connection and the 60s route lifetime.
export async function withScheduledJobLock<T>(
  job: ScheduledJob,
  run: () => Promise<T>,
  database: Pick<DbSession, 'execute'> = db
): Promise<{ acquired: false } | { acquired: true; result: T }> {
  const owner = randomUUID()
  const rows = await database.execute<{ owner: string }>(sql`
    insert into public.scheduled_job_leases (job, owner, expires_at)
    values (${job}, ${owner}::uuid, clock_timestamp() + interval '15 minutes')
    on conflict (job) do update set owner = excluded.owner, expires_at = excluded.expires_at
      where scheduled_job_leases.expires_at <= clock_timestamp()
    returning owner
  `)
  if (rows[0]?.owner !== owner) return { acquired: false }
  try {
    return { acquired: true, result: await run() }
  } finally {
    // If release fails, leave the reservation to expire instead of permitting overlap.
    await database.execute(sql`delete from public.scheduled_job_leases where job = ${job} and owner = ${owner}::uuid`)
  }
}
