ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "customer_name" text,
  ADD COLUMN IF NOT EXISTS "customer_phone" text,
  ADD COLUMN IF NOT EXISTS "customer_document" text,
  ADD COLUMN IF NOT EXISTS "delivery_address" text,
  ADD COLUMN IF NOT EXISTS "delivery_address_reference" text,
  ADD COLUMN IF NOT EXISTS "delivery_neighborhood" text,
  ADD COLUMN IF NOT EXISTS "delivery_fee" numeric(19, 4),
  ADD COLUMN IF NOT EXISTS "coupon_code" text,
  ADD COLUMN IF NOT EXISTS "origin" text,
  ADD COLUMN IF NOT EXISTS "idempotency_key" text,
  ADD COLUMN IF NOT EXISTS "request_id" text,
  ADD COLUMN IF NOT EXISTS "snapshot" jsonb,
  ADD COLUMN IF NOT EXISTS "technical_ack_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "accepted_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "rejected_at" timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_store_id_idempotency_key_unique"
  ON "orders" ("store_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "public_order_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade,
  "order_id" integer REFERENCES "orders"("id") ON DELETE set null,
  "request_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_hash" text NOT NULL,
  "status" text NOT NULL,
  "technical_status" text NOT NULL,
  "sales_channel" text DEFAULT 'DIGITAL_MENU' NOT NULL,
  "order_type" text NOT NULL,
  "cart_snapshot" jsonb NOT NULL,
  "totals_snapshot" jsonb NOT NULL,
  "catalog_snapshot" jsonb NOT NULL,
  "customer_snapshot" jsonb NOT NULL,
  "address_snapshot" jsonb,
  "payment_snapshot" jsonb NOT NULL,
  "validation_errors" jsonb,
  "submitted_at" timestamp with time zone NOT NULL,
  "technical_ack_at" timestamp with time zone,
  "sent_to_store_at" timestamp with time zone,
  "received_at" timestamp with time zone,
  "accepted_at" timestamp with time zone,
  "rejected_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT current_timestamp NOT NULL,
  "updated_at" timestamp with time zone DEFAULT current_timestamp NOT NULL,
  CONSTRAINT "public_order_submissions_status_check"
    CHECK ("status" IN ('PENDING', 'CREATED', 'SENT_TO_STORE', 'RECEIVED', 'ACCEPTED', 'REJECTED', 'CANCELLED')),
  CONSTRAINT "public_order_submissions_technical_status_check"
    CHECK ("technical_status" IN ('QUEUED', 'DELIVERING', 'ACKED', 'RETRYING', 'FAILED', 'DEAD_LETTER')),
  CONSTRAINT "public_order_submissions_sales_channel_check"
    CHECK ("sales_channel" = 'DIGITAL_MENU'),
  CONSTRAINT "public_order_submissions_order_type_check"
    CHECK ("order_type" IN ('DELIVERY', 'TAKEOUT')),
  CONSTRAINT "public_order_submissions_store_id_idempotency_key_unique"
    UNIQUE ("store_id", "idempotency_key")
);

CREATE INDEX IF NOT EXISTS "public_order_submissions_store_status_idx"
  ON "public_order_submissions" ("store_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "public_order_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "public_order_id" uuid NOT NULL REFERENCES "public_order_submissions"("id") ON DELETE cascade,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade,
  "event_type" text NOT NULL,
  "from_status" text,
  "to_status" text,
  "actor_type" text NOT NULL,
  "actor_user_id" text,
  "request_id" text NOT NULL,
  "payload" jsonb,
  "created_at" timestamp with time zone DEFAULT current_timestamp NOT NULL,
  CONSTRAINT "public_order_events_actor_type_check"
    CHECK ("actor_type" IN ('customer', 'system', 'store', 'ops_admin'))
);

CREATE INDEX IF NOT EXISTS "public_order_events_public_order_id_idx"
  ON "public_order_events" ("public_order_id", "created_at");

CREATE INDEX IF NOT EXISTS "public_order_events_store_id_idx"
  ON "public_order_events" ("store_id", "created_at");

CREATE TABLE IF NOT EXISTS "public_order_delivery_attempts" (
  "id" serial PRIMARY KEY NOT NULL,
  "public_order_id" uuid NOT NULL REFERENCES "public_order_submissions"("id") ON DELETE cascade,
  "attempt" integer NOT NULL,
  "status" text NOT NULL,
  "error_code" text,
  "error_message" text,
  "next_retry_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT current_timestamp NOT NULL,
  "updated_at" timestamp with time zone DEFAULT current_timestamp NOT NULL,
  CONSTRAINT "public_order_delivery_attempts_status_check"
    CHECK ("status" IN ('queued', 'sent', 'acked', 'failed', 'dead_letter'))
);

CREATE INDEX IF NOT EXISTS "public_order_delivery_attempts_public_order_id_idx"
  ON "public_order_delivery_attempts" ("public_order_id", "created_at");

REVOKE ALL ON "public_order_submissions" FROM anon, authenticated;
REVOKE ALL ON "public_order_events" FROM anon, authenticated;
REVOKE ALL ON "public_order_delivery_attempts" FROM anon, authenticated;
