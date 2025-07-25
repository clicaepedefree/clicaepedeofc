import { Column, type SQL } from 'drizzle-orm'

/**
 * Makes all columns in a record nullable for use with GROUPING SETS
 */
export type MakeNullable<T extends Record<string, Column | SQL | SQL.Aliased>> = {
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
