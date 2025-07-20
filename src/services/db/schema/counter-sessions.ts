import { countersTable } from '@/services/db/schema/counters'
import {
  baseCurrencyColumnGenerator,
  baseTimestampColumnGenerator,
  createdAtColumnGenerator,
} from '@/services/db/schema/utils'
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { usersTable } from './users'

export const counterSessionsTable = pgTable(
  'counter_sessions',
  {
    id: serial('id').primaryKey(),
    counterId: integer('counter_id')
      .notNull()
      .references(() => countersTable.id, { onDelete: 'no action' }),
    operatorId: uuid('operator_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'no action' }),
    status: text('status', { enum: ['OPEN', 'CLOSED'] })
      .notNull()
      .default('OPEN'),

    openedAt: createdAtColumnGenerator('opened_at'),
    openAmount: baseCurrencyColumnGenerator('open_amount').notNull(),
    openNotes: text('open_notes'),
    openReceipt: text('open_receipt'),

    closedAt: baseTimestampColumnGenerator('closed_at'),
    closeAmount: baseCurrencyColumnGenerator('close_amount'),
    closeNotes: text('close_notes'),
    closeReceipt: text('close_receipt'),

    closedByOperatorId: uuid('closed_by_operator_id').references(
      () => usersTable.id,
      {
        onDelete: 'no action',
      }
    ),
  },
  table => [
    index('counter_sessions_counter_id_idx').on(table.counterId),
    uniqueIndex('single_open_session_per_counter_id')
      .on(table.counterId)
      .where(sql`${table.status} = 'OPEN'`),
    check(
      'closed_session_has_amount_and_closed_at',
      sql`${table.status} != 'CLOSED' OR (${table.closeAmount} IS NOT NULL AND ${table.closedAt} IS NOT NULL)`
    ),
  ]
)

export type InsertCounterSession = typeof counterSessionsTable.$inferInsert
export type SelectCounterSession = typeof counterSessionsTable.$inferSelect
