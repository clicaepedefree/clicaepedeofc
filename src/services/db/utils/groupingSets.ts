import { MakeNullable } from '@/services/db/utils/types'
import { Column, sql, type SQL } from 'drizzle-orm'

/**
 * Creates a grouping with GROUPING SETS and returns the columns with proper nullable typing.
 * This is a more direct approach than using groupingSets + makeNullable separately.
 *
 * @param columnsSelection - Object containing the columns to group by
 * @returns The SQL for groupBy and the columns with nullable types applied
 */
export function groupingSets<
  T extends Record<string, Column | SQL | SQL.Aliased>,
>(
  columnsSelection: T
): {
  groupingSetsSQL: SQL
  groupingColumns: MakeNullable<T>
} {
  const columnValues = Object.values(columnsSelection)
  const groupingSetsSQL = sql`GROUPING SETS(${sql.join(columnValues, sql`, `)})`

  const groupingColumns = {} as MakeNullable<T>
  for (const [key, column] of Object.entries(columnsSelection)) {
    groupingColumns[key as keyof T] = column as any
  }

  return {
    groupingSetsSQL,
    groupingColumns,
  }
}
