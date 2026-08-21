CREATE TABLE IF NOT EXISTS "billing_reminder_rules" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "channel" text NOT NULL,
  "days_after_due" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "title" text NOT NULL,
  "message_template" text,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "billing_reminder_rules_channel_check" CHECK ("channel" IN ('email', 'whatsapp', 'system')),
  CONSTRAINT "billing_reminder_rules_status_check" CHECK ("status" IN ('active', 'inactive')),
  CONSTRAINT "billing_reminder_rules_days_check" CHECK ("days_after_due" >= 0 AND "days_after_due" <= 90)
);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_reminder_rules_global_unique"
  ON "billing_reminder_rules" ("channel", "days_after_due")
  WHERE "store_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "billing_reminder_rules_store_unique"
  ON "billing_reminder_rules" ("store_id", "channel", "days_after_due")
  WHERE "store_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "billing_reminder_rules_store_status_idx"
  ON "billing_reminder_rules" ("store_id", "status");

CREATE TABLE IF NOT EXISTS "store_billing_reminder_deliveries" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "subscription_id" integer REFERENCES "store_subscriptions"("id") ON DELETE set null ON UPDATE no action,
  "invoice_id" integer NOT NULL REFERENCES "store_billing_invoices"("id") ON DELETE cascade ON UPDATE no action,
  "rule_id" integer REFERENCES "billing_reminder_rules"("id") ON DELETE set null ON UPDATE no action,
  "channel" text NOT NULL,
  "days_after_due" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'sent',
  "recipient" text,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "scheduled_for" timestamp with time zone NOT NULL,
  "sent_at" timestamp with time zone,
  "skipped_at" timestamp with time zone,
  "failure_reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "store_billing_reminder_deliveries_channel_check" CHECK ("channel" IN ('email', 'whatsapp', 'system')),
  CONSTRAINT "store_billing_reminder_deliveries_status_check" CHECK ("status" IN ('queued', 'sent', 'skipped', 'failed')),
  CONSTRAINT "store_billing_reminder_deliveries_days_check" CHECK ("days_after_due" >= 0 AND "days_after_due" <= 90),
  CONSTRAINT "store_billing_reminder_deliveries_dedupe_unique" UNIQUE ("dedupe_key")
);

CREATE INDEX IF NOT EXISTS "store_billing_reminder_deliveries_invoice_idx"
  ON "store_billing_reminder_deliveries" ("invoice_id", "created_at");

CREATE INDEX IF NOT EXISTS "store_billing_reminder_deliveries_store_status_idx"
  ON "store_billing_reminder_deliveries" ("store_id", "status");

CREATE INDEX IF NOT EXISTS "store_billing_reminder_deliveries_scheduled_idx"
  ON "store_billing_reminder_deliveries" ("scheduled_for");

INSERT INTO "billing_reminder_rules"
  ("store_id", "channel", "days_after_due", "status", "title", "message_template")
VALUES
  (NULL, 'system', 0, 'active', 'Fatura venceu hoje', 'A fatura {{invoiceNumber}} venceu hoje. Bloqueio previsto em {{expectedBlockAt}}.'),
  (NULL, 'email', 1, 'active', 'Fatura em atraso', 'A fatura {{invoiceNumber}} esta em atraso ha {{daysAfterDue}} dia(s). Bloqueio previsto em {{expectedBlockAt}}.'),
  (NULL, 'whatsapp', 3, 'active', 'Lembrete de cobranca', 'A fatura {{invoiceNumber}} continua em aberto. O acesso pode ser bloqueado em {{expectedBlockAt}}.')
ON CONFLICT DO NOTHING;

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
      'billing_adjustment_created',
      'billing_reminder_sent'
    )
  );

ALTER TABLE "billing_reminder_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_billing_reminder_deliveries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_reminder_rules" FORCE ROW LEVEL SECURITY;
ALTER TABLE "store_billing_reminder_deliveries" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "billing_reminder_rules" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "store_billing_reminder_deliveries" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "billing_reminder_rules_id_seq" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "store_billing_reminder_deliveries_id_seq" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE "billing_reminder_rules" TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE "store_billing_reminder_deliveries" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "billing_reminder_rules_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "store_billing_reminder_deliveries_id_seq" TO service_role;

COMMENT ON TABLE "billing_reminder_rules" IS
  'Agenda global ou por loja para lembretes de faturas vencidas.';

COMMENT ON TABLE "store_billing_reminder_deliveries" IS
  'Historico idempotente dos lembretes de cobranca gerados por fatura, canal e etapa.';
