import {
  createdAt,
  updatedAt,
  baseTimestampColumnGenerator,
} from '@/services/db/schema/utils'
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { storesTable } from './stores'

export const storeImplementationChecklistItemKeys = [
  'menu',
  'integrations',
  'payments',
  'test_order',
  'training',
] as const

export const storeImplementationChecklistItemStatuses = [
  'pending',
  'completed',
] as const

export const storeImplementationChecklistItemsTable = pgTable(
  'store_implementation_checklist_items',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    itemKey: text('item_key', {
      enum: storeImplementationChecklistItemKeys,
    }).notNull(),
    title: text('title').notNull(),
    status: text('status', {
      enum: storeImplementationChecklistItemStatuses,
    })
      .notNull()
      .default('pending'),
    requiredForActivation: boolean('required_for_activation')
      .notNull()
      .default(true),
    completedAt: baseTimestampColumnGenerator('completed_at'),
    completedByClerkId: text('completed_by_clerk_id'),
    completedByEmail: text('completed_by_email'),
    completedByName: text('completed_by_name'),
    observation: text('observation'),
    createdAt,
    updatedAt,
  },
  table => ({
    storeItemUnique: uniqueIndex(
      'store_implementation_checklist_items_store_item_unique'
    ).on(table.storeId, table.itemKey),
  })
)

export const storeImplementationChecklistEventsTable = pgTable(
  'store_implementation_checklist_events',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    checklistItemId: integer('checklist_item_id')
      .notNull()
      .references(() => storeImplementationChecklistItemsTable.id, {
        onDelete: 'cascade',
      }),
    itemKey: text('item_key', {
      enum: storeImplementationChecklistItemKeys,
    }).notNull(),
    previousStatus: text('previous_status', {
      enum: storeImplementationChecklistItemStatuses,
    }).notNull(),
    newStatus: text('new_status', {
      enum: storeImplementationChecklistItemStatuses,
    }).notNull(),
    actorClerkId: text('actor_clerk_id').notNull(),
    actorEmail: text('actor_email').notNull(),
    actorName: text('actor_name'),
    observation: text('observation'),
    createdAt,
  }
)

export type StoreImplementationChecklistItem =
  typeof storeImplementationChecklistItemsTable.$inferSelect
export type StoreImplementationChecklistItemKey =
  (typeof storeImplementationChecklistItemKeys)[number]
