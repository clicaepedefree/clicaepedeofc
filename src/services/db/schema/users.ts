import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core'

export const usersTable = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clerkId: text('clerk_id').notNull().unique(),
    email: text('email').notNull().unique(),
    phone: text('phone'),
    name: text('name'),
    createdAt,
    updatedAt,
  },
  table => [index('users_clerk_id_idx').on(table.clerkId)]
)

export type InsertUser = typeof usersTable.$inferInsert
export type SelectUser = typeof usersTable.$inferSelect
