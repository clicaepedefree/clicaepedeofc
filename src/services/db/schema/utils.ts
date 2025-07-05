import { sql } from 'drizzle-orm'
import { numeric, timestamp } from 'drizzle-orm/pg-core'

export const currentTimestamp = sql`CURRENT_TIMESTAMP`

export const baseTimestampColumnGenerator = (columnName: string) =>
  timestamp(columnName, { withTimezone: true })

export const baseCurrencyColumnGenerator = (columnName: string) =>
  numeric(columnName, { precision: 19, scale: 4 })

export const createdAtColumnGenerator = (columnName = 'created_at') =>
  baseTimestampColumnGenerator(columnName).notNull().default(currentTimestamp)

export const updatedAtColumnGenerator = (columnName = 'updated_at') =>
  createdAtColumnGenerator(columnName).$onUpdateFn(() => new Date())

export const createdAt = createdAtColumnGenerator()

export const updatedAt = updatedAtColumnGenerator()
