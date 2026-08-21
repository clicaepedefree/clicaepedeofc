ALTER TABLE "stores"
ADD COLUMN IF NOT EXISTS "timezone" text NOT NULL DEFAULT 'America/Sao_Paulo';

CREATE INDEX IF NOT EXISTS "orders_report_completed_store_created_idx"
ON "orders" ("store_id", "created_at")
WHERE "status" = 'COMPLETED';
