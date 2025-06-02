import { pgTable, serial, text } from 'drizzle-orm/pg-core'

export const menusTable = pgTable('menus', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique('menu_name_unique'),
})

export type InsertMenu = typeof menusTable.$inferInsert
export type SelectMenu = typeof menusTable.$inferSelect
