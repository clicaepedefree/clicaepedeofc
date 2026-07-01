import { createdAt } from '@/services/db/schema/utils'
import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
} from 'drizzle-orm/pg-core'
import { storesTable } from './stores'

export const publicOrderSecurityEventsTable = pgTable(
  'public_order_security_events',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    ipHash: text('ip_hash'),
    deviceHash: text('device_hash'),
    phoneHash: text('phone_hash'),
    userAgentHash: text('user_agent_hash'),
    riskScore: integer('risk_score').notNull().default(0),
    captchaStatus: text('captcha_status', {
      enum: ['not_required', 'required', 'passed', 'failed'],
    })
      .notNull()
      .default('not_required'),
    retryAfterSeconds: integer('retry_after_seconds'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt,
  },
  table => [
    index('public_order_security_events_store_created_idx').on(
      table.storeId,
      table.createdAt
    ),
    index('public_order_security_events_ip_created_idx').on(
      table.ipHash,
      table.createdAt
    ),
    index('public_order_security_events_device_created_idx').on(
      table.deviceHash,
      table.createdAt
    ),
    index('public_order_security_events_phone_created_idx').on(
      table.phoneHash,
      table.createdAt
    ),
  ]
)
