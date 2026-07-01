ALTER TABLE "public_order_submissions"
  ALTER COLUMN "terms_accepted_at" DROP NOT NULL;

COMMENT ON COLUMN "public_order_submissions"."terms_accepted_at" IS
  'Timestamp do aceite explicito apresentado no checkout publico; nulo para pedidos historicos.';
