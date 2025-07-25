import {
  Column,
  InferSelectModel,
  sql,
  Subquery,
  Table,
  type SQL,
} from 'drizzle-orm'
import { AnyPgSelect } from 'drizzle-orm/pg-core'

/**
 * Infers the data type from an SQL expression
 */
export type InferSQLDataType<T extends SQL | SQL.Aliased> =
  T extends SQL<infer U> ? U : T extends SQL.Aliased<infer U> ? U : never

/**
 * Infers the data type from a column, considering nullability
 */
export type InferColumnDataType<T extends Column> = T['_']['notNull'] extends true
  ? T['_']['data']
  : T['_']['data'] | null

/**
 * Infers data types for a record of columns or SQL expressions
 */
export type InferRecordDataTypes<
  T extends Record<string, Column | SQL | SQL.Aliased>,
> = {
  [K in keyof T]: T[K] extends SQL | SQL.Aliased
    ? InferSQLDataType<T[K]>
    : T[K] extends Column
      ? InferColumnDataType<T[K]>
      : never
}

/**
 * Creates a json_agg SQL expression with optional filtering for null values
 * 
 * @param selection - The item to aggregate
 * @param options - Options for aggregation
 * @returns SQL expression for json_agg
 */
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
