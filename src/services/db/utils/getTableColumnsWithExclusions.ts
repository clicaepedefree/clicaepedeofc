import { getTableColumns, Table } from 'drizzle-orm'

/**
 * Type for filtering columns by value
 */
export type FilterColumnsByValue<
  Columns extends Record<string, any>,
  ExcludedValues extends readonly any[],
> = {
  [K in keyof Columns as Columns[K] extends ExcludedValues[number]
    ? never
    : K]: Columns[K]
}

/**
 * Returns table columns excluding specified columns
 * 
 * @param table - The table to get columns from
 * @param exclusions - Array of columns to exclude
 * @returns Filtered table columns
 */
export function getTableColumnsWithExclusions<
  T extends Table,
  ExcludedValues extends readonly T['_']['columns'][keyof T['_']['columns']][],
>(
  table: T,
  exclusions: ExcludedValues
): FilterColumnsByValue<T['_']['columns'], ExcludedValues> {
  const tableColumns = getTableColumns(table)

  const filteredTableColumns = Object.entries(tableColumns).reduce(
    (acc, [key, value]) => {
      if (!exclusions.includes(value as any)) {
        acc[key] = value
      }
      return acc
    },
    {} as any
  )

  return filteredTableColumns
}
