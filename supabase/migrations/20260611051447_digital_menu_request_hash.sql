ALTER TABLE "public_order_submissions"
  ADD COLUMN IF NOT EXISTS "request_hash" text;

UPDATE "public_order_submissions"
SET "request_hash" = encode(digest(coalesce("request_id", '') || ':' || coalesce("idempotency_key", ''), 'sha256'), 'hex')
WHERE "request_hash" IS NULL;

ALTER TABLE "public_order_submissions"
  ALTER COLUMN "request_hash" SET NOT NULL;
