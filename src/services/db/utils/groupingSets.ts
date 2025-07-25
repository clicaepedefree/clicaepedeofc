import { Column, sql, type SQL } from 'drizzle-orm'
import { MakeNullable } from '@/services/db/utils/types'

/**
 * Creates a GROUPING SETS SQL expression and returns a helper to make columns nullable
 * in the selection for proper typing when using grouping sets.
 *
 * @param columns - The columns to include in the grouping sets
 * @returns An object with the SQL expression and a helper to make columns nullable
 */
export function groupingSets<
  T extends Record<string, Column | SQL | SQL.Aliased>,
>(
  ...columns: (Column | SQL | SQL.Aliased)[]
): {
  sql: SQL
  makeNullable: <TSelection extends T>(
    selection: TSelection
  ) => MakeNullable<TSelection>
} {
  const groupingSetsSQL = sql`GROUPING SETS(${sql.join(columns, sql`, `)})`

  return {
    sql: groupingSetsSQL,
    makeNullable: <TSelection extends T>(
      selection: TSelection
    ): MakeNullable<TSelection> => {
      const nullableSelection = {} as MakeNullable<TSelection>

      for (const [key, column] of Object.entries(selection)) {
        // Cast the column to be nullable for grouping sets results
        nullableSelection[key as keyof TSelection] = column as any
      }

      return nullableSelection
    },
  }
}
