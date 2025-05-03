import { getTableColumns, sql, Table, type SQL } from 'drizzle-orm'
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
export function coalesce<T>(value: SQL.Aliased<T> | SQL<T> | PgColumn, defaultValue: SQL | PgColumn): SQL<T> {
  return sql<T>`coalesce(${value}, ${defaultValue})`
}

type FilterColumnsByValue<Columns extends Record<string, any>, ExcludedValues extends readonly any[]> = {
  [K in keyof Columns as Columns[K] extends ExcludedValues[number] ? never : K]: Columns[K]
}

export function getTableColumnsWithExclusions<
  T extends Table,
  ExcludedValues extends readonly T['_']['columns'][keyof T['_']['columns']][],
>(table: T, exclusions: ExcludedValues): FilterColumnsByValue<T['_']['columns'], ExcludedValues> {
  const tableColumns = getTableColumns(table)

  const filteredTableColumns = Object.entries(tableColumns).reduce((acc, [key, value]) => {
    if (!exclusions.includes(value as any)) {
      acc[key] = value
    }
    return acc
  }, {} as any)

  return filteredTableColumns
}
