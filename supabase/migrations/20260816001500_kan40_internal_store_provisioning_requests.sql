CREATE TABLE IF NOT EXISTS "internal_store_provisioning_requests" (
  "id" serial PRIMARY KEY,
  "idempotency_key" text NOT NULL,
  "status" text DEFAULT 'processing' NOT NULL,
  "actor_clerk_id" text NOT NULL,
  "actor_email" text NOT NULL,
  "payload_hash" text NOT NULL,
  "store_id" integer REFERENCES "stores"("id") ON DELETE no action ON UPDATE no action,
  "subscription_id" integer REFERENCES "store_subscriptions"("id") ON DELETE no action ON UPDATE no action,
  "invoice_id" integer REFERENCES "store_billing_invoices"("id") ON DELETE no action ON UPDATE no action,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "internal_store_provisioning_requests_idempotency_key_unique"
    UNIQUE ("idempotency_key"),
  CONSTRAINT "internal_store_provisioning_requests_status_check"
    CHECK ("status" IN ('processing', 'succeeded')),
  CONSTRAINT "internal_store_provisioning_requests_success_shape_check"
    CHECK (
      ("status" = 'processing' AND "store_id" IS NULL AND "subscription_id" IS NULL AND "invoice_id" IS NULL)
      OR
      ("status" = 'succeeded' AND "store_id" IS NOT NULL AND "subscription_id" IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS "internal_store_provisioning_requests_store_idx"
  ON "internal_store_provisioning_requests" ("store_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'store_billing_invoices_subscription_period_unique'
  ) THEN
    ALTER TABLE "store_billing_invoices"
      ADD CONSTRAINT "store_billing_invoices_subscription_period_unique"
      UNIQUE ("subscription_id", "period_start", "period_end");
  END IF;
END $$;

ALTER TABLE "internal_store_provisioning_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "internal_store_provisioning_requests" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "internal_store_provisioning_requests" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "internal_store_provisioning_requests_id_seq" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE "internal_store_provisioning_requests" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "internal_store_provisioning_requests_id_seq" TO service_role;

COMMENT ON TABLE "internal_store_provisioning_requests" IS
  'Internal idempotency ledger for atomic store provisioning requests.';
