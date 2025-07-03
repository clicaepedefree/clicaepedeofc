import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core'
import { storesTable } from './stores'
import { usersTable } from './users'

export const userStorePermissionsTable = pgTable(
  'user_store_permissions',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin'] }).notNull(),
    createdAt,
    updatedAt,
  },
  table => [primaryKey({ columns: [table.userId, table.storeId] })]
)

export type InsertUserStorePermission = typeof userStorePermissionsTable.$inferInsert
export type SelectUserStorePermission = typeof userStorePermissionsTable.$inferSelect
