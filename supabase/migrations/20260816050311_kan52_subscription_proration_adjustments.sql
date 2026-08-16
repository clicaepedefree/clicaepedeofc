CREATE TABLE IF NOT EXISTS "store_billing_adjustments" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "plan_change_id" integer NOT NULL REFERENCES "store_subscription_plan_changes"("id") ON DELETE no action ON UPDATE no action,
  "source_subscription_id" integer NOT NULL REFERENCES "store_subscriptions"("id") ON DELETE no action ON UPDATE no action,
  "target_subscription_id" integer REFERENCES "store_subscriptions"("id") ON DELETE no action ON UPDATE no action,
  "invoice_id" integer REFERENCES "store_billing_invoices"("id") ON DELETE set null ON UPDATE no action,
  "adjustment_type" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "amount" numeric(19, 4) DEFAULT 0 NOT NULL,
  "currency" text DEFAULT 'BRL' NOT NULL,
  "competence_start" timestamp with time zone NOT NULL,
  "competence_end" timestamp with time zone NOT NULL,
  "calculation_snapshot" jsonb NOT NULL,
  "reason" text NOT NULL,
  "actor_clerk_id" text NOT NULL,
  "actor_email" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "store_billing_adjustments_plan_change_unique" UNIQUE ("plan_change_id"),
  CONSTRAINT "store_billing_adjustments_type_check"
    CHECK ("adjustment_type" IN ('debit', 'credit', 'none')),
  CONSTRAINT "store_billing_adjustments_status_check"
    CHECK ("status" IN ('open', 'invoiced', 'applied', 'recorded', 'waived', 'cancelled')),
  CONSTRAINT "store_billing_adjustments_amount_non_negative_check"
    CHECK ("amount" >= 0),
  CONSTRAINT "store_billing_adjustments_competence_check"
    CHECK ("competence_end" >= "competence_start"),
  CONSTRAINT "store_billing_adjustments_invoice_type_check"
    CHECK ("invoice_id" IS NULL OR "adjustment_type" = 'debit')
);

CREATE INDEX IF NOT EXISTS "store_billing_adjustments_store_status_idx"
  ON "store_billing_adjustments" ("store_id", "status");

CREATE INDEX IF NOT EXISTS "store_billing_adjustments_source_subscription_idx"
  ON "store_billing_adjustments" ("source_subscription_id");

CREATE INDEX IF NOT EXISTS "store_billing_adjustments_target_subscription_idx"
  ON "store_billing_adjustments" ("target_subscription_id");

CREATE INDEX IF NOT EXISTS "store_billing_adjustments_invoice_idx"
  ON "store_billing_adjustments" ("invoice_id");

ALTER TABLE "store_billing_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_billing_adjustments" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "store_billing_adjustments" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "store_billing_adjustments_id_seq" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE "store_billing_adjustments" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "store_billing_adjustments_id_seq" TO service_role;

ALTER TABLE "store_billing_events"
  DROP CONSTRAINT IF EXISTS "store_billing_events_type_check";

ALTER TABLE "store_billing_events"
  ADD CONSTRAINT "store_billing_events_type_check" CHECK (
    "event_type" IN (
      'subscription_created',
      'subscription_changed',
      'subscription_cancelled',
      'invoice_created',
      'invoice_status_changed',
      'payment_registered',
      'payment_confirmed',
      'payment_failed',
      'refund_registered',
      'billing_adjustment_created'
    )
  );

COMMENT ON TABLE "store_billing_adjustments" IS
  'Immutable operational financial adjustments such as plan-change proration credits and debits.';

COMMENT ON COLUMN "store_billing_adjustments"."calculation_snapshot" IS
  'Auditable memory of the deterministic inputs and formula used for the adjustment.';
