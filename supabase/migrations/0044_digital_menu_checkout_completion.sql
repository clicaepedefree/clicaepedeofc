ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "order_notes" text,
  ADD COLUMN IF NOT EXISTS "delivery_address_complement" text;

ALTER TABLE "public_order_submissions"
  ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamp with time zone;

COMMENT ON COLUMN "public_order_submissions"."terms_accepted_at" IS
  'Timestamp do aceite explicito apresentado no checkout publico; nulo para pedidos historicos.';
