import { itemOfferingsTable } from '@/services/db/schema/item-offerings'
import { optionGroupsTable } from '@/services/db/schema/option-groups'
import { integer, pgTable, serial } from 'drizzle-orm/pg-core'

export const itemOfferingOptionGroupsTable = pgTable('item_offering_option_groups', {
  id: serial('id').primaryKey(),
  itemOfferingId: integer('item_offering_id')
    .notNull()
    .references(() => itemOfferingsTable.id, { onDelete: 'cascade' }),
  optionGroupId: integer('option_group_id')
    .notNull()
    .references(() => optionGroupsTable.id, { onDelete: 'cascade' }),
  index: integer('index').notNull(),
})

export type InsertItemOfferingOptionGroup = typeof itemOfferingOptionGroupsTable.$inferInsert
export type SelectItemOfferingOptionGroup = typeof itemOfferingOptionGroupsTable.$inferSelect
