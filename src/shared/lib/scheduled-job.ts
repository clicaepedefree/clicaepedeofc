import { sql } from 'drizzle-orm'
import { db } from '@/services/db'
import type { DbSession } from '@/services/db/types'

import type { ScheduledJob } from './scheduled-job-policy'
export { authorizeWorkerRequest, matchesJobSecret, jobAlreadyRunning } from './scheduled-job-policy'
const jobKeys = { billing: 135001, whatsapp: 135002 } as const

// Transaction-scoped locks work with the transaction pooler and release on disconnect.
export async function withScheduledJobLock<T>(
  job: ScheduledJob,
  run: () => Promise<T>,
  database: Pick<DbSession, 'transaction'> = db
): Promise<{ acquired: false } | { acquired: true; result: T }> {
  return database.transaction(async transaction => {
    const rows = await transaction.execute<{ acquired: boolean }>(
      sql`select pg_try_advisory_xact_lock(135, ${jobKeys[job]}) as acquired`
    )
    if (!rows[0]?.acquired) return { acquired: false as const }
    return { acquired: true as const, result: await run() }
  })
}
