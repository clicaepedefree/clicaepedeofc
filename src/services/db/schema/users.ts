import {
  createdAt,
  updatedAt,
  baseTimestampColumnGenerator,
} from '@/services/db/schema/utils'
import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core'

export const userStatuses = ['active', 'deleted'] as const

export const usersTable = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clerkId: text('clerk_id').unique(),
    email: text('email').notNull(),
    phone: text('phone'),
    name: text('name'),
    status: text('status', { enum: userStatuses }).notNull().default('active'),
    deletedAt: baseTimestampColumnGenerator('deleted_at'),
    lastLoginAt: baseTimestampColumnGenerator('last_login_at'),
    createdAt,
    updatedAt,
  },
  table => [index('users_clerk_id_idx').on(table.clerkId)]
)

export type InsertUser = typeof usersTable.$inferInsert
export type SelectUser = typeof usersTable.$inferSelect
