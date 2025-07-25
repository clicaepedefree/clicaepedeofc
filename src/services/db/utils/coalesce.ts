import { sql, type SQL } from 'drizzle-orm'
import { PgColumn } from 'drizzle-orm/pg-core'

/**
 * Returns a SQL expression that represents the coalescing of two values.
 * If the first value is not null or undefined, it is returned. Otherwise, the default value is returned.
 *
 * @template T - The type of the value being coalesced.
 * @param {SQL.Aliased<T> | SQL<T>} value - The value to be coalesced.
 * @param {SQL} defaultValue - The default value to be returned if the first value is null or undefined.
 * @returns {SQL<T>} - The SQL expression representing the coalesced value.
 */
export function coalesce<T, R = unknown>(
  value: SQL.Aliased<T> | SQL<T> | PgColumn,
  defaultValue: SQL<R> | PgColumn
): SQL<R extends NonNullable<T> ? R : T> {
  return sql`coalesce(${value}, ${defaultValue})`
}
