import { sql } from 'drizzle-orm'
import { timestamp } from 'drizzle-orm/pg-core'

export const createdAt = timestamp('created_at')
  .notNull()
  .default(sql`CURRENT_TIMESTAMP`)

export const updatedAt = timestamp('updated_at')
  .default(sql`CURRENT_TIMESTAMP`)
  .notNull()
  .$onUpdateFn(() => new Date())
