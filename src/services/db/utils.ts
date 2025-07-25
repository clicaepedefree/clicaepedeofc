import {
  Column,
  ColumnsSelection,
  getTableColumns,
  InferSelectModel,
  sql,
  Subquery,
  Table,
  type SQL,
} from 'drizzle-orm'
import {
  AnyPgSelect,
  PgColumn,
  SubqueryWithSelection,
  WithSubqueryWithSelection,
} from 'drizzle-orm/pg-core'

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

type FilterColumnsByValue<
  Columns extends Record<string, any>,
  ExcludedValues extends readonly any[],
> = {
  [K in keyof Columns as Columns[K] extends ExcludedValues[number]
    ? never
    : K]: Columns[K]
}

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

export function getSubQueryColumns<
  TTableName extends string,
  TColumnsSelection extends ColumnsSelection,
>(
  subquery:
    | SubqueryWithSelection<TColumnsSelection, TTableName>
    | WithSubqueryWithSelection<TColumnsSelection, TTableName>
): TColumnsSelection {
  return subquery._.selectedFields as TColumnsSelection
}

type InferSQLDataType<T extends SQL | SQL.Aliased> =
  T extends SQL<infer U> ? U : T extends SQL.Aliased<infer U> ? U : never

type InferColumnDataType<T extends Column> = T['_']['notNull'] extends true
  ? T['_']['data']
  : T['_']['data'] | null

type InferRecordDataTypes<
  T extends Record<string, Column | SQL | SQL.Aliased>,
> = {
  [K in keyof T]: T[K] extends SQL | SQL.Aliased
    ? InferSQLDataType<T[K]>
    : T[K] extends Column
      ? InferColumnDataType<T[K]>
      : never
}

export function jsonAgg<T extends Table | Column | Subquery | AnyPgSelect>(
  selection: T,
  { notNull = true }: { notNull?: boolean } = {}
): SQL<
  T extends Table
    ? InferSelectModel<T>
    : T extends Column
      ? InferColumnDataType<T>[]
      : T extends Subquery
        ? InferRecordDataTypes<T['_']['selectedFields']>[]
        : T extends AnyPgSelect
          ? Awaited<T>
          : never
> {
  if (notNull) {
    return sql`json_agg(${selection}) filter (where ${selection} is not null)`
  }
  return sql`json_agg(${selection})`
}

type MakeNullable<T extends Record<string, Column | SQL | SQL.Aliased>> = {
  [K in keyof T]: T[K] extends Column
    ? T[K]['_']['notNull'] extends true
      ? SQL<T[K]['_']['data'] | null>
      : T[K]
    : T[K] extends SQL<infer U>
      ? SQL<U | null>
      : T[K] extends SQL.Aliased<infer U>
        ? SQL.Aliased<U | null>
        : T[K]
}

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
