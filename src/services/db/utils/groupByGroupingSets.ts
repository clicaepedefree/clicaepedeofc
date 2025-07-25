import { Column, sql, type SQL } from 'drizzle-orm'
import { MakeNullable } from '@/services/db/utils/types'

/**
 * Creates a grouping with GROUPING SETS and returns the columns with proper nullable typing.
 * This is a more direct approach than using groupingSets + makeNullable separately.
 *
 * @param columnsSelection - Object containing the columns to group by
 * @returns The SQL for groupBy and the columns with nullable types applied
 */
export function groupByGroupingSets<
  T extends Record<string, Column | SQL | SQL.Aliased>,
>(
  columnsSelection: T
): {
  groupBySQL: SQL
  groupingColumns: MakeNullable<T>
} {
  // Extract column values for the GROUPING SETS clause
  const columnValues = Object.values(columnsSelection)
  const groupBySQL = sql`GROUPING SETS(${sql.join(columnValues, sql`, `)})`

  // Create nullable versions of all columns
  const groupingColumns = {} as MakeNullable<T>
  for (const [key, column] of Object.entries(columnsSelection)) {
    groupingColumns[key as keyof T] = column as any
  }

  return {
    groupBySQL,
    groupingColumns,
  }
}
