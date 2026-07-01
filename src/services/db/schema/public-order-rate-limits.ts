import { createdAt, updatedAt } from '@/services/db/schema/utils'
import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { storesTable } from './stores'

export const publicOrderRateLimitsTable = pgTable(
  'public_order_rate_limits',
  {
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    ipHash: text('ip_hash').notNull(),
    phoneHash: text('phone_hash').notNull(),
    windowSeconds: integer('window_seconds').notNull(),
    bucketStartedAt: timestamp('bucket_started_at', { withTimezone: true }).notNull(),
    requestCount: integer('request_count').notNull().default(1),
    createdAt,
    updatedAt,
  },
  table => [
    primaryKey({
      name: 'public_order_rate_limits_pk',
      columns: [
        table.storeId,
        table.ipHash,
        table.phoneHash,
        table.windowSeconds,
        table.bucketStartedAt,
      ],
    }),
    index('public_order_rate_limits_cleanup_idx').on(table.bucketStartedAt),
  ]
)
