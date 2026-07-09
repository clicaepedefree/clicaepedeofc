CREATE TABLE IF NOT EXISTS "digital_menu_promotions" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade,
  "code" text,
  "name" text NOT NULL,
  "description" text,
  "type" text NOT NULL,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "min_order_amount" numeric(19, 4),
  "discount_amount" numeric(19, 4),
  "discount_percent" integer,
  "max_discount_amount" numeric(19, 4),
  "free_delivery_minimum" numeric(19, 4),
  "usage_limit" integer,
  "used_count" integer DEFAULT 0 NOT NULL,
  "per_customer_limit" integer,
  "priority" integer DEFAULT 0 NOT NULL,
  "is_featured" boolean DEFAULT false NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "digital_menu_promotions_type_check" CHECK ("type" IN ('FIXED_AMOUNT', 'PERCENTAGE', 'FREE_DELIVERY', 'FREE_DELIVERY_THRESHOLD', 'FEATURED_ITEM', 'COMBO', 'ITEM_PRICE')),
  CONSTRAINT "digital_menu_promotions_status_check" CHECK ("status" IN ('ACTIVE', 'PAUSED')),
  CONSTRAINT "digital_menu_promotions_discount_percent_check" CHECK ("discount_percent" IS NULL OR ("discount_percent" > 0 AND "discount_percent" <= 100)),
  CONSTRAINT "digital_menu_promotions_money_check" CHECK (
    ("min_order_amount" IS NULL OR "min_order_amount" >= 0)
    AND ("discount_amount" IS NULL OR "discount_amount" >= 0)
    AND ("max_discount_amount" IS NULL OR "max_discount_amount" >= 0)
    AND ("free_delivery_minimum" IS NULL OR "free_delivery_minimum" >= 0)
  ),
  CONSTRAINT "digital_menu_promotions_usage_check" CHECK (
    ("usage_limit" IS NULL OR "usage_limit" > 0)
    AND "used_count" >= 0
    AND ("per_customer_limit" IS NULL OR "per_customer_limit" > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "digital_menu_promotions_store_code_unique"
  ON "digital_menu_promotions" ("store_id", "code")
  WHERE "code" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "digital_menu_promotions_store_status_idx"
  ON "digital_menu_promotions" ("store_id", "status", "type");

CREATE TABLE IF NOT EXISTS "digital_menu_promotion_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "promotion_id" integer NOT NULL REFERENCES "digital_menu_promotions"("id") ON DELETE cascade,
  "item_offering_id" integer NOT NULL REFERENCES "item_offerings"("id") ON DELETE cascade,
  "quantity" integer DEFAULT 1 NOT NULL,
  "promotional_price" numeric(19, 4),
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "digital_menu_promotion_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "digital_menu_promotion_items_price_check" CHECK ("promotional_price" IS NULL OR "promotional_price" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "digital_menu_promotion_items_unique"
  ON "digital_menu_promotion_items" ("promotion_id", "item_offering_id");

CREATE TABLE IF NOT EXISTS "digital_menu_promotion_redemptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "promotion_id" integer NOT NULL REFERENCES "digital_menu_promotions"("id") ON DELETE cascade,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade,
  "order_id" integer REFERENCES "orders"("id") ON DELETE set null,
  "public_order_id" uuid REFERENCES "public_order_submissions"("id") ON DELETE set null,
  "customer_hash" text,
  "coupon_code" text,
  "discount_amount" numeric(19, 4) DEFAULT '0' NOT NULL,
  "delivery_discount_amount" numeric(19, 4) DEFAULT '0' NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "digital_menu_promotion_redemptions_promotion_idx"
  ON "digital_menu_promotion_redemptions" ("promotion_id", "created_at");

CREATE INDEX IF NOT EXISTS "digital_menu_promotion_redemptions_customer_idx"
  ON "digital_menu_promotion_redemptions" ("promotion_id", "customer_hash")
  WHERE "customer_hash" IS NOT NULL;

ALTER TABLE "digital_menu_promotions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "digital_menu_promotion_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "digital_menu_promotion_redemptions" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "digital_menu_promotions" FROM anon, authenticated;
REVOKE ALL ON TABLE "digital_menu_promotion_items" FROM anon, authenticated;
REVOKE ALL ON TABLE "digital_menu_promotion_redemptions" FROM anon, authenticated;
