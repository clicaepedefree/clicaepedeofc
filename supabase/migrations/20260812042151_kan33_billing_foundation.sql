CREATE TABLE IF NOT EXISTS "billing_plans" (
  "id" serial PRIMARY KEY,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active' NOT NULL,
  "default_amount" numeric(19, 4) NOT NULL,
  "currency" text DEFAULT 'BRL' NOT NULL,
  "billing_interval" text NOT NULL,
  "billing_interval_count" integer DEFAULT 1 NOT NULL,
  "trial_days" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "billing_plans_code_unique" UNIQUE ("code"),
  CONSTRAINT "billing_plans_status_check" CHECK ("status" IN ('active', 'archived')),
  CONSTRAINT "billing_plans_interval_check" CHECK ("billing_interval" IN ('monthly', 'quarterly', 'semiannual', 'annual')),
  CONSTRAINT "billing_plans_interval_count_positive_check" CHECK ("billing_interval_count" > 0),
  CONSTRAINT "billing_plans_trial_days_non_negative_check" CHECK ("trial_days" >= 0),
  CONSTRAINT "billing_plans_default_amount_non_negative_check" CHECK ("default_amount" >= 0)
);

CREATE TABLE IF NOT EXISTS "store_subscriptions" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "plan_id" integer NOT NULL REFERENCES "billing_plans"("id") ON DELETE no action ON UPDATE no action,
  "status" text DEFAULT 'active' NOT NULL,
  "contracted_amount" numeric(19, 4) NOT NULL,
  "currency" text DEFAULT 'BRL' NOT NULL,
  "billing_interval" text NOT NULL,
  "billing_interval_count" integer DEFAULT 1 NOT NULL,
  "discount_type" text,
  "discount_value" numeric(19, 4),
  "starts_at" timestamp with time zone NOT NULL,
  "current_period_start" timestamp with time zone NOT NULL,
  "current_period_end" timestamp with time zone NOT NULL,
  "next_billing_at" timestamp with time zone NOT NULL,
  "canceled_at" timestamp with time zone,
  "cancellation_reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "store_subscriptions_status_check" CHECK ("status" IN ('trialing', 'active', 'past_due', 'paused', 'canceled')),
  CONSTRAINT "store_subscriptions_interval_check" CHECK ("billing_interval" IN ('monthly', 'quarterly', 'semiannual', 'annual')),
  CONSTRAINT "store_subscriptions_interval_count_positive_check" CHECK ("billing_interval_count" > 0),
  CONSTRAINT "store_subscriptions_amount_non_negative_check" CHECK ("contracted_amount" >= 0),
  CONSTRAINT "store_subscriptions_discount_type_check" CHECK ("discount_type" IS NULL OR "discount_type" IN ('fixed_amount', 'percentage')),
  CONSTRAINT "store_subscriptions_discount_pair_check" CHECK (
    ("discount_type" IS NULL AND "discount_value" IS NULL)
    OR ("discount_type" IS NOT NULL AND "discount_value" IS NOT NULL)
  ),
  CONSTRAINT "store_subscriptions_discount_value_check" CHECK (
    "discount_value" IS NULL
    OR (
      "discount_value" >= 0
      AND ("discount_type" != 'percentage' OR "discount_value" <= 100)
    )
  ),
  CONSTRAINT "store_subscriptions_period_check" CHECK ("current_period_end" > "current_period_start"),
  CONSTRAINT "store_subscriptions_next_billing_check" CHECK ("next_billing_at" >= "current_period_end")
);

CREATE UNIQUE INDEX IF NOT EXISTS "store_subscriptions_one_open_per_store_idx"
  ON "store_subscriptions" ("store_id")
  WHERE "status" IN ('trialing', 'active', 'past_due', 'paused');

CREATE INDEX IF NOT EXISTS "store_subscriptions_store_status_idx"
  ON "store_subscriptions" ("store_id", "status");

CREATE INDEX IF NOT EXISTS "store_subscriptions_next_billing_idx"
  ON "store_subscriptions" ("next_billing_at");

CREATE TABLE IF NOT EXISTS "store_billing_invoices" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "subscription_id" integer NOT NULL REFERENCES "store_subscriptions"("id") ON DELETE no action ON UPDATE no action,
  "plan_id" integer REFERENCES "billing_plans"("id") ON DELETE no action ON UPDATE no action,
  "invoice_number" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "currency" text DEFAULT 'BRL' NOT NULL,
  "subtotal_amount" numeric(19, 4) NOT NULL,
  "discount_amount" numeric(19, 4) DEFAULT 0 NOT NULL,
  "total_amount" numeric(19, 4) NOT NULL,
  "amount_paid" numeric(19, 4) DEFAULT 0 NOT NULL,
  "amount_refunded" numeric(19, 4) DEFAULT 0 NOT NULL,
  "plan_snapshot" jsonb NOT NULL,
  "contract_snapshot" jsonb NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "due_at" timestamp with time zone NOT NULL,
  "paid_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "refunded_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "store_billing_invoices_invoice_number_unique" UNIQUE ("invoice_number"),
  CONSTRAINT "store_billing_invoices_status_check" CHECK ("status" IN ('pending', 'paid', 'overdue', 'cancelled', 'refunded')),
  CONSTRAINT "store_billing_invoices_amounts_non_negative_check" CHECK (
    "subtotal_amount" >= 0
    AND "discount_amount" >= 0
    AND "total_amount" >= 0
    AND "amount_paid" >= 0
    AND "amount_refunded" >= 0
  ),
  CONSTRAINT "store_billing_invoices_total_check" CHECK ("total_amount" = "subtotal_amount" - "discount_amount"),
  CONSTRAINT "store_billing_invoices_discount_cap_check" CHECK ("discount_amount" <= "subtotal_amount"),
  CONSTRAINT "store_billing_invoices_refund_cap_check" CHECK ("amount_refunded" <= "amount_paid"),
  CONSTRAINT "store_billing_invoices_period_check" CHECK ("period_end" > "period_start")
);

CREATE INDEX IF NOT EXISTS "store_billing_invoices_store_status_idx"
  ON "store_billing_invoices" ("store_id", "status");

CREATE INDEX IF NOT EXISTS "store_billing_invoices_due_at_idx"
  ON "store_billing_invoices" ("due_at");

CREATE TABLE IF NOT EXISTS "store_billing_payments" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "invoice_id" integer NOT NULL REFERENCES "store_billing_invoices"("id") ON DELETE no action ON UPDATE no action,
  "status" text DEFAULT 'pending' NOT NULL,
  "method" text NOT NULL,
  "amount" numeric(19, 4) NOT NULL,
  "currency" text DEFAULT 'BRL' NOT NULL,
  "provider" text,
  "provider_payment_id" text,
  "paid_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "refunded_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "store_billing_payments_status_check" CHECK ("status" IN ('pending', 'confirmed', 'failed', 'cancelled', 'refunded')),
  CONSTRAINT "store_billing_payments_method_check" CHECK ("method" IN ('pix', 'credit_card', 'boleto', 'manual', 'external')),
  CONSTRAINT "store_billing_payments_amount_non_negative_check" CHECK ("amount" >= 0),
  CONSTRAINT "store_billing_payments_provider_pair_check" CHECK (
    ("provider" IS NULL AND "provider_payment_id" IS NULL)
    OR ("provider" IS NOT NULL AND "provider_payment_id" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "store_billing_payments_provider_payment_unique"
  ON "store_billing_payments" ("provider", "provider_payment_id")
  WHERE "provider_payment_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "store_billing_payments_invoice_status_idx"
  ON "store_billing_payments" ("invoice_id", "status");

CREATE INDEX IF NOT EXISTS "store_billing_payments_store_status_idx"
  ON "store_billing_payments" ("store_id", "status");

CREATE TABLE IF NOT EXISTS "store_billing_events" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "subscription_id" integer REFERENCES "store_subscriptions"("id") ON DELETE set null ON UPDATE no action,
  "invoice_id" integer REFERENCES "store_billing_invoices"("id") ON DELETE set null ON UPDATE no action,
  "payment_id" integer REFERENCES "store_billing_payments"("id") ON DELETE set null ON UPDATE no action,
  "event_type" text NOT NULL,
  "actor_clerk_id" text,
  "actor_email" text,
  "reason" text,
  "previous_values" jsonb,
  "new_values" jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "store_billing_events_type_check" CHECK (
    "event_type" IN (
      'subscription_created',
      'subscription_changed',
      'subscription_cancelled',
      'invoice_created',
      'invoice_status_changed',
      'payment_registered',
      'payment_confirmed',
      'payment_failed',
      'refund_registered'
    )
  )
);

CREATE INDEX IF NOT EXISTS "store_billing_events_store_created_idx"
  ON "store_billing_events" ("store_id", "created_at");

CREATE INDEX IF NOT EXISTS "store_billing_events_subscription_idx"
  ON "store_billing_events" ("subscription_id");

CREATE INDEX IF NOT EXISTS "store_billing_events_invoice_idx"
  ON "store_billing_events" ("invoice_id");

CREATE OR REPLACE FUNCTION "reject_store_billing_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'store_billing_events is append-only' USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION "reject_store_billing_event_mutation"() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "store_billing_events_append_only" ON "store_billing_events";

CREATE TRIGGER "store_billing_events_append_only"
BEFORE UPDATE OR DELETE ON "store_billing_events"
FOR EACH ROW EXECUTE FUNCTION "reject_store_billing_event_mutation"();

ALTER TABLE "billing_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_billing_invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_billing_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_billing_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "billing_plans" FORCE ROW LEVEL SECURITY;
ALTER TABLE "store_subscriptions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "store_billing_invoices" FORCE ROW LEVEL SECURITY;
ALTER TABLE "store_billing_payments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "store_billing_events" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "billing_plans" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "store_subscriptions" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "store_billing_invoices" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "store_billing_payments" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "store_billing_events" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON SEQUENCE "billing_plans_id_seq" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "store_subscriptions_id_seq" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "store_billing_invoices_id_seq" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "store_billing_payments_id_seq" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "store_billing_events_id_seq" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE "billing_plans" TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE "store_subscriptions" TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE "store_billing_invoices" TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE "store_billing_payments" TO service_role;
GRANT SELECT, INSERT ON TABLE "store_billing_events" TO service_role;

GRANT USAGE, SELECT ON SEQUENCE "billing_plans_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "store_subscriptions_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "store_billing_invoices_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "store_billing_payments_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "store_billing_events_id_seq" TO service_role;

COMMENT ON TABLE "store_billing_events" IS
  'Append-only backend billing audit trail. No public policies or UPDATE/DELETE grants.';
