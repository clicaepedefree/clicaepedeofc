CREATE TABLE IF NOT EXISTS "store_digital_menu_settings" (
  "store_id" integer PRIMARY KEY NOT NULL REFERENCES "stores"("id") ON DELETE cascade,
  "logo_file_id" integer REFERENCES "store_files"("id") ON DELETE set null,
  "whatsapp_phone" text,
  "is_digital_menu_enabled" boolean DEFAULT true NOT NULL,
  "is_accepting_orders" boolean DEFAULT true NOT NULL,
  "manual_pause_reason" text,
  "manual_pause_until" timestamp with time zone,
  "minimum_order_amount" numeric(19, 4) DEFAULT '0' NOT NULL,
  "average_preparation_minutes" integer DEFAULT 30 NOT NULL,
  "allow_scheduled_orders" boolean DEFAULT false NOT NULL,
  "schedule_min_lead_minutes" integer DEFAULT 30 NOT NULL,
  "schedule_max_days_ahead" integer DEFAULT 7 NOT NULL,
  "created_at" timestamp with time zone DEFAULT current_timestamp NOT NULL,
  "updated_at" timestamp with time zone DEFAULT current_timestamp NOT NULL,
  CONSTRAINT "store_digital_menu_settings_minimum_order_amount_check" CHECK ("minimum_order_amount" >= 0),
  CONSTRAINT "store_digital_menu_settings_average_preparation_minutes_check" CHECK ("average_preparation_minutes" BETWEEN 1 AND 600),
  CONSTRAINT "store_digital_menu_settings_schedule_min_lead_minutes_check" CHECK ("schedule_min_lead_minutes" >= 0),
  CONSTRAINT "store_digital_menu_settings_schedule_max_days_ahead_check" CHECK ("schedule_max_days_ahead" BETWEEN 0 AND 90)
);

CREATE TABLE IF NOT EXISTS "store_delivery_zones" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade,
  "type" text NOT NULL,
  "name" text NOT NULL,
  "neighborhood" text,
  "postal_code_prefix" text,
  "center_lat" numeric(10, 7),
  "center_lng" numeric(10, 7),
  "radius_meters" integer,
  "delivery_fee" numeric(19, 4) DEFAULT '0' NOT NULL,
  "free_delivery_minimum" numeric(19, 4),
  "minimum_order_amount" numeric(19, 4),
  "estimated_delivery_minutes" integer DEFAULT 45 NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT current_timestamp NOT NULL,
  "updated_at" timestamp with time zone DEFAULT current_timestamp NOT NULL,
  CONSTRAINT "store_delivery_zones_type_check" CHECK ("type" IN ('NEIGHBORHOOD', 'RADIUS', 'POSTAL_CODE')),
  CONSTRAINT "store_delivery_zones_delivery_fee_check" CHECK ("delivery_fee" >= 0),
  CONSTRAINT "store_delivery_zones_free_delivery_minimum_check" CHECK ("free_delivery_minimum" IS NULL OR "free_delivery_minimum" >= 0),
  CONSTRAINT "store_delivery_zones_minimum_order_amount_check" CHECK ("minimum_order_amount" IS NULL OR "minimum_order_amount" >= 0),
  CONSTRAINT "store_delivery_zones_estimated_delivery_minutes_check" CHECK ("estimated_delivery_minutes" BETWEEN 1 AND 600)
);

CREATE INDEX IF NOT EXISTS "store_delivery_zones_store_active_priority_idx"
  ON "store_delivery_zones" ("store_id", "is_active", "priority");

CREATE INDEX IF NOT EXISTS "store_delivery_zones_store_neighborhood_idx"
  ON "store_delivery_zones" ("store_id", "neighborhood");

CREATE TABLE IF NOT EXISTS "store_business_hours" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade,
  "weekday" integer NOT NULL,
  "opens_at" time NOT NULL,
  "closes_at" time NOT NULL,
  "service_type" text DEFAULT 'ALL' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT current_timestamp NOT NULL,
  "updated_at" timestamp with time zone DEFAULT current_timestamp NOT NULL,
  CONSTRAINT "store_business_hours_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "store_business_hours_service_type_check" CHECK ("service_type" IN ('DELIVERY', 'TAKEOUT', 'ALL')),
  CONSTRAINT "store_business_hours_opens_before_closes_check" CHECK ("opens_at" < "closes_at")
);

CREATE INDEX IF NOT EXISTS "store_business_hours_store_weekday_idx"
  ON "store_business_hours" ("store_id", "weekday", "is_active");

CREATE TABLE IF NOT EXISTS "store_special_hours" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade,
  "date" date NOT NULL,
  "reason" text,
  "is_closed" boolean DEFAULT false NOT NULL,
  "opens_at" time,
  "closes_at" time,
  "service_type" text DEFAULT 'ALL' NOT NULL,
  "created_at" timestamp with time zone DEFAULT current_timestamp NOT NULL,
  "updated_at" timestamp with time zone DEFAULT current_timestamp NOT NULL,
  CONSTRAINT "store_special_hours_service_type_check" CHECK ("service_type" IN ('DELIVERY', 'TAKEOUT', 'ALL')),
  CONSTRAINT "store_special_hours_open_window_check" CHECK ("is_closed" = true OR ("opens_at" IS NOT NULL AND "closes_at" IS NOT NULL AND "opens_at" < "closes_at"))
);

CREATE INDEX IF NOT EXISTS "store_special_hours_store_date_idx"
  ON "store_special_hours" ("store_id", "date");

CREATE TABLE IF NOT EXISTS "store_payment_methods" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade,
  "method" text NOT NULL,
  "card_brand" text,
  "requires_change_for" boolean DEFAULT false NOT NULL,
  "instructions" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT current_timestamp NOT NULL,
  "updated_at" timestamp with time zone DEFAULT current_timestamp NOT NULL,
  CONSTRAINT "store_payment_methods_method_check" CHECK ("method" IN ('CASH', 'PIX', 'CREDIT', 'DEBIT', 'MEAL_VOUCHER', 'FOOD_VOUCHER')),
  CONSTRAINT "store_payment_methods_store_method_card_brand_unique" UNIQUE ("store_id", "method", "card_brand")
);

CREATE INDEX IF NOT EXISTS "store_payment_methods_store_active_idx"
  ON "store_payment_methods" ("store_id", "is_active");

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "delivery_zone_id" integer REFERENCES "store_delivery_zones"("id") ON DELETE set null,
  ADD COLUMN IF NOT EXISTS "delivery_estimated_minutes" integer,
  ADD COLUMN IF NOT EXISTS "delivery_eta" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "rejection_reason" text,
  ADD COLUMN IF NOT EXISTS "accepted_by_user_id" text,
  ADD COLUMN IF NOT EXISTS "rejected_by_user_id" text,
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "public_tracking_token_hash" text,
  ADD COLUMN IF NOT EXISTS "last_printed_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "print_count" integer DEFAULT 0 NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_public_tracking_token_hash_unique"
  ON "orders" ("public_tracking_token_hash")
  WHERE "public_tracking_token_hash" IS NOT NULL;

ALTER TABLE "public_order_submissions"
  ADD COLUMN IF NOT EXISTS "tracking_token_hash" text,
  ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "delivery_zone_snapshot" jsonb,
  ADD COLUMN IF NOT EXISTS "store_settings_snapshot" jsonb,
  ADD COLUMN IF NOT EXISTS "business_hours_snapshot" jsonb,
  ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'public_digital_menu' NOT NULL,
  ADD COLUMN IF NOT EXISTS "rejection_reason" text,
  ADD COLUMN IF NOT EXISTS "accepted_by_user_id" text,
  ADD COLUMN IF NOT EXISTS "rejected_by_user_id" text,
  ADD COLUMN IF NOT EXISTS "customer_ip_hash" text,
  ADD COLUMN IF NOT EXISTS "user_agent_hash" text,
  ADD COLUMN IF NOT EXISTS "captcha_status" text,
  ADD COLUMN IF NOT EXISTS "risk_score" integer;

CREATE UNIQUE INDEX IF NOT EXISTS "public_order_submissions_tracking_token_hash_unique"
  ON "public_order_submissions" ("tracking_token_hash")
  WHERE "tracking_token_hash" IS NOT NULL;

REVOKE ALL ON "store_digital_menu_settings" FROM anon, authenticated;
REVOKE ALL ON "store_delivery_zones" FROM anon, authenticated;
REVOKE ALL ON "store_business_hours" FROM anon, authenticated;
REVOKE ALL ON "store_special_hours" FROM anon, authenticated;
REVOKE ALL ON "store_payment_methods" FROM anon, authenticated;
