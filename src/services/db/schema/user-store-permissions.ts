import {
  createdAt,
  updatedAt,
  baseTimestampColumnGenerator,
} from '@/services/db/schema/utils'
import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
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
    isPrimaryResponsible: boolean('is_primary_responsible')
      .notNull()
      .default(false),
    assignedPrimaryAt: baseTimestampColumnGenerator('assigned_primary_at'),
    revokedAt: baseTimestampColumnGenerator('revoked_at'),
    revokedReason: text('revoked_reason'),
    createdAt,
    updatedAt,
  },
  table => [
    primaryKey({ columns: [table.userId, table.storeId] }),
    index('user_store_permissions_store_id_idx').on(table.storeId),
    uniqueIndex('user_store_permissions_one_primary_responsible_idx')
      .on(table.storeId)
      .where(
        sql`${table.isPrimaryResponsible} = true and ${table.revokedAt} is null and ${table.role} = 'admin'`
      ),
  ]
)

export type InsertUserStorePermission =
  typeof userStorePermissionsTable.$inferInsert
export type SelectUserStorePermission =
  typeof userStorePermissionsTable.$inferSelect
