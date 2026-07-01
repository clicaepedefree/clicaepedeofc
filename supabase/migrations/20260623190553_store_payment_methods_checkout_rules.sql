ALTER TABLE "store_payment_methods"
  ADD COLUMN IF NOT EXISTS "proof_instructions" text,
  ADD COLUMN IF NOT EXISTS "pix_key" text,
  ADD COLUMN IF NOT EXISTS "allow_delivery" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "allow_takeout" boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS "integration_provider" text,
  ADD COLUMN IF NOT EXISTS "integration_config" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "store_payment_methods"
  DROP CONSTRAINT IF EXISTS "store_payment_methods_method_check";

ALTER TABLE "store_payment_methods"
  ADD CONSTRAINT "store_payment_methods_method_check"
  CHECK ("method" IN ('CASH', 'PIX', 'CREDIT', 'DEBIT', 'MEAL_VOUCHER', 'FOOD_VOUCHER', 'ONLINE'));

ALTER TABLE "order_payments"
  DROP CONSTRAINT IF EXISTS "card_brand_required_for_card";

CREATE TABLE IF NOT EXISTS "order_payment_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL,
  "order_payment_id" integer NOT NULL,
  "method" text NOT NULL,
  "provider" text NOT NULL,
  "status" text NOT NULL,
  "amount" numeric(19, 4) NOT NULL,
  "external_id" text,
  "txid" text,
  "qr_code" text,
  "copy_paste_code" text,
  "expires_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "provider_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "order_payment_transactions_method_check" CHECK ("method" IN ('PIX', 'ONLINE')),
  CONSTRAINT "order_payment_transactions_status_check" CHECK ("status" IN ('PENDING', 'WAITING_PAYMENT', 'PAID', 'EXPIRED', 'CANCELLED', 'FAILED')),
  CONSTRAINT "order_payment_transactions_provider_external_id_unique" UNIQUE ("provider", "external_id")
);

ALTER TABLE "order_payment_transactions"
  ADD CONSTRAINT "order_payment_transactions_store_id_stores_id_fk"
  FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "order_payment_transactions"
  ADD CONSTRAINT "order_payment_transactions_order_payment_id_order_payments_id_fk"
  FOREIGN KEY ("order_payment_id") REFERENCES "public"."order_payments"("id") ON DELETE cascade ON UPDATE no action;

CREATE INDEX IF NOT EXISTS "order_payment_transactions_store_status_idx"
  ON "order_payment_transactions" ("store_id", "status");

REVOKE ALL ON "order_payment_transactions" FROM anon, authenticated;
