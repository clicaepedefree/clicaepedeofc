import { storeModuleEntitlementsTable } from '@/services/db/schema'
import { sql, type SQL } from 'drizzle-orm'

export function buildStoreModuleEntitlementExpirySql(now: Date): SQL<Date> {
  return sql`greatest(${now.toISOString()}::timestamptz, ${storeModuleEntitlementsTable.startsAt} + interval '1 millisecond')`
}

export function buildActiveStoreModuleEntitlementWindowSql(
  now: Date
): SQL<unknown> {
  return sql`(${storeModuleEntitlementsTable.endsAt} is null or ${storeModuleEntitlementsTable.endsAt} > ${now.toISOString()}::timestamptz)`
}
