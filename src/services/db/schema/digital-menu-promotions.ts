import { itemOfferingsTable } from '@/services/db/schema/item-offerings'
import { storesTable } from '@/services/db/schema/stores'
import { createdAt, updatedAt } from '@/services/db/schema/utils'
import { isNotNull } from 'drizzle-orm'
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { ordersTable } from './orders'
import { publicOrderSubmissionsTable } from './public-order-submissions'

export const digitalMenuPromotionTypes = [
  'FIXED_AMOUNT',
  'PERCENTAGE',
  'FREE_DELIVERY',
  'FREE_DELIVERY_THRESHOLD',
  'FEATURED_ITEM',
  'COMBO',
  'ITEM_PRICE',
] as const

export const digitalMenuPromotionStatuses = ['ACTIVE', 'PAUSED'] as const

export const digitalMenuPromotionsTable = pgTable(
  'digital_menu_promotions',
  {
    id: serial('id').primaryKey(),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    code: text('code'),
    name: text('name').notNull(),
    description: text('description'),
    type: text('type', { enum: digitalMenuPromotionTypes }).notNull(),
    status: text('status', { enum: digitalMenuPromotionStatuses })
      .notNull()
      .default('ACTIVE'),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    minOrderAmount: numeric('min_order_amount', { precision: 19, scale: 4 }),
    discountAmount: numeric('discount_amount', { precision: 19, scale: 4 }),
    discountPercent: integer('discount_percent'),
    maxDiscountAmount: numeric('max_discount_amount', {
      precision: 19,
      scale: 4,
    }),
    freeDeliveryMinimum: numeric('free_delivery_minimum', {
      precision: 19,
      scale: 4,
    }),
    usageLimit: integer('usage_limit'),
    usedCount: integer('used_count').notNull().default(0),
    perCustomerLimit: integer('per_customer_limit'),
    priority: integer('priority').notNull().default(0),
    isFeatured: boolean('is_featured').notNull().default(false),
    metadata: jsonb('metadata'),
    createdAt,
    updatedAt,
  },
  table => [
    uniqueIndex('digital_menu_promotions_store_code_unique')
      .on(table.storeId, table.code)
      .where(isNotNull(table.code)),
  ]
)

export const digitalMenuPromotionItemsTable = pgTable(
  'digital_menu_promotion_items',
  {
    id: serial('id').primaryKey(),
    promotionId: integer('promotion_id')
      .notNull()
      .references(() => digitalMenuPromotionsTable.id, { onDelete: 'cascade' }),
    itemOfferingId: integer('item_offering_id')
      .notNull()
      .references(() => itemOfferingsTable.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(1),
    promotionalPrice: numeric('promotional_price', { precision: 19, scale: 4 }),
    createdAt,
  },
  table => [
    uniqueIndex('digital_menu_promotion_items_unique').on(
      table.promotionId,
      table.itemOfferingId
    ),
  ]
)

export const digitalMenuPromotionRedemptionsTable = pgTable(
  'digital_menu_promotion_redemptions',
  {
    id: serial('id').primaryKey(),
    promotionId: integer('promotion_id')
      .notNull()
      .references(() => digitalMenuPromotionsTable.id, { onDelete: 'cascade' }),
    storeId: integer('store_id')
      .notNull()
      .references(() => storesTable.id, { onDelete: 'cascade' }),
    orderId: integer('order_id').references(() => ordersTable.id, {
      onDelete: 'set null',
    }),
    publicOrderId: uuid('public_order_id').references(
      () => publicOrderSubmissionsTable.id,
      { onDelete: 'set null' }
    ),
    customerHash: text('customer_hash'),
    couponCode: text('coupon_code'),
    discountAmount: numeric('discount_amount', { precision: 19, scale: 4 })
      .notNull()
      .default('0'),
    deliveryDiscountAmount: numeric('delivery_discount_amount', {
      precision: 19,
      scale: 4,
    })
      .notNull()
      .default('0'),
    metadata: jsonb('metadata'),
    createdAt,
  }
)

export type SelectDigitalMenuPromotion =
  typeof digitalMenuPromotionsTable.$inferSelect
export type InsertDigitalMenuPromotion =
  typeof digitalMenuPromotionsTable.$inferInsert
