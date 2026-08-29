import { storeModuleEntitlementsTable } from '@/services/db/schema'
import { sql, type SQL } from 'drizzle-orm'

export function buildStoreModuleEntitlementExpirySql(now: Date): SQL<Date> {
  return sql`greatest(${now.toISOString()}::timestamptz, ${storeModuleEntitlementsTable.startsAt} + interval '1 millisecond')`
}
