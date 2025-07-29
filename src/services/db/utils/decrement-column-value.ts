import { AnyColumn, sql } from 'drizzle-orm'

export const decrementColumnValue = (column: AnyColumn, quantity = 1) => {
  return sql`CASE
        WHEN ${column} - ${quantity} IS NULL THEN NULL
        ELSE ${column} - ${quantity}
      END`
}
