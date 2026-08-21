CREATE TABLE IF NOT EXISTS "store_billing_gateway_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "provider" text NOT NULL,
  "provider_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "signature_status" text DEFAULT 'valid' NOT NULL,
  "store_id" integer,
  "subscription_id" integer,
  "invoice_id" integer,
  "payment_id" integer,
  "invoice_number" text,
  "provider_payment_id" text,
  "amount" numeric(19, 4),
  "currency" text DEFAULT 'BRL' NOT NULL,
  "payload_hash" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "headers_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "last_error" text,
  "occurred_at" timestamp with time zone,
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "store_billing_gateway_events_provider_event_unique" UNIQUE("provider", "provider_event_id"),
  CONSTRAINT "store_billing_gateway_events_event_type_check" CHECK ("event_type" IN ('payment_succeeded', 'payment_failed', 'payment_refunded', 'payment_cancelled', 'unknown')),
  CONSTRAINT "store_billing_gateway_events_status_check" CHECK ("status" IN ('queued', 'processing', 'processed', 'failed', 'ignored')),
  CONSTRAINT "store_billing_gateway_events_signature_status_check" CHECK ("signature_status" IN ('valid', 'invalid'))
);

CREATE TABLE IF NOT EXISTS "store_billing_reconciliation_issues" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer,
  "invoice_id" integer,
  "payment_id" integer,
  "gateway_event_id" integer,
  "provider" text NOT NULL,
  "provider_event_id" text,
  "issue_type" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "severity" text DEFAULT 'warning' NOT NULL,
  "reason" text NOT NULL,
  "expected_values" jsonb,
  "observed_values" jsonb,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "store_billing_reconciliation_issues_issue_type_check" CHECK ("issue_type" IN ('invalid_signature', 'invalid_origin', 'unsupported_event', 'invoice_not_found', 'amount_mismatch', 'payment_exceeds_outstanding', 'refund_exceeds_paid', 'out_of_order_event', 'invoice_payment_total_mismatch', 'processing_error')),
  CONSTRAINT "store_billing_reconciliation_issues_status_check" CHECK ("status" IN ('open', 'resolved', 'ignored')),
  CONSTRAINT "store_billing_reconciliation_issues_severity_check" CHECK ("severity" IN ('info', 'warning', 'critical'))
);

ALTER TABLE "store_billing_gateway_events"
  ADD CONSTRAINT "store_billing_gateway_events_store_id_stores_id_fk"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "store_billing_gateway_events"
  ADD CONSTRAINT "store_billing_gateway_events_subscription_id_store_subscriptions_id_fk"
  FOREIGN KEY ("subscription_id") REFERENCES "store_subscriptions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "store_billing_gateway_events"
  ADD CONSTRAINT "store_billing_gateway_events_invoice_id_store_billing_invoices_id_fk"
  FOREIGN KEY ("invoice_id") REFERENCES "store_billing_invoices"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "store_billing_gateway_events"
  ADD CONSTRAINT "store_billing_gateway_events_payment_id_store_billing_payments_id_fk"
  FOREIGN KEY ("payment_id") REFERENCES "store_billing_payments"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "store_billing_reconciliation_issues"
  ADD CONSTRAINT "store_billing_reconciliation_issues_store_id_stores_id_fk"
  FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "store_billing_reconciliation_issues"
  ADD CONSTRAINT "store_billing_reconciliation_issues_invoice_id_store_billing_invoices_id_fk"
  FOREIGN KEY ("invoice_id") REFERENCES "store_billing_invoices"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "store_billing_reconciliation_issues"
  ADD CONSTRAINT "store_billing_reconciliation_issues_payment_id_store_billing_payments_id_fk"
  FOREIGN KEY ("payment_id") REFERENCES "store_billing_payments"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "store_billing_reconciliation_issues"
  ADD CONSTRAINT "store_billing_reconciliation_issues_gateway_event_id_store_billing_gateway_events_id_fk"
  FOREIGN KEY ("gateway_event_id") REFERENCES "store_billing_gateway_events"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS "store_billing_gateway_events_status_next_attempt_idx"
  ON "store_billing_gateway_events" ("status", "next_attempt_at");
CREATE INDEX IF NOT EXISTS "store_billing_gateway_events_invoice_idx"
  ON "store_billing_gateway_events" ("invoice_id");
CREATE INDEX IF NOT EXISTS "store_billing_gateway_events_payment_idx"
  ON "store_billing_gateway_events" ("payment_id");
CREATE INDEX IF NOT EXISTS "store_billing_gateway_events_provider_payment_idx"
  ON "store_billing_gateway_events" ("provider", "provider_payment_id");
CREATE INDEX IF NOT EXISTS "store_billing_gateway_events_invalid_signature_idx"
  ON "store_billing_gateway_events" ("provider", "created_at")
  WHERE "signature_status" = 'invalid';

CREATE INDEX IF NOT EXISTS "store_billing_reconciliation_issues_status_idx"
  ON "store_billing_reconciliation_issues" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "store_billing_reconciliation_issues_store_idx"
  ON "store_billing_reconciliation_issues" ("store_id", "status");
CREATE INDEX IF NOT EXISTS "store_billing_reconciliation_issues_invoice_idx"
  ON "store_billing_reconciliation_issues" ("invoice_id");
CREATE INDEX IF NOT EXISTS "store_billing_reconciliation_issues_gateway_event_idx"
  ON "store_billing_reconciliation_issues" ("gateway_event_id");

ALTER TABLE "store_billing_gateway_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_billing_reconciliation_issues" ENABLE ROW LEVEL SECURITY;
