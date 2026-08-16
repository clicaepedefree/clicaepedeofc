CREATE TABLE IF NOT EXISTS "store_subscription_plan_changes" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "subscription_id" integer NOT NULL REFERENCES "store_subscriptions"("id") ON DELETE no action ON UPDATE no action,
  "applied_subscription_id" integer REFERENCES "store_subscriptions"("id") ON DELETE no action ON UPDATE no action,
  "from_plan_id" integer NOT NULL REFERENCES "billing_plans"("id") ON DELETE no action ON UPDATE no action,
  "to_plan_id" integer NOT NULL REFERENCES "billing_plans"("id") ON DELETE no action ON UPDATE no action,
  "timing" text NOT NULL,
  "status" text NOT NULL,
  "module_treatment" text NOT NULL,
  "keep_custom_amount" boolean NOT NULL,
  "previous_contracted_amount" numeric(19, 4) NOT NULL,
  "next_contracted_amount" numeric(19, 4) NOT NULL,
  "currency" text DEFAULT 'BRL' NOT NULL,
  "effective_at" timestamp with time zone NOT NULL,
  "applied_at" timestamp with time zone,
  "cancelled_at" timestamp with time zone,
  "actor_clerk_id" text NOT NULL,
  "actor_email" text NOT NULL,
  "reason" text NOT NULL,
  "previous_values" jsonb NOT NULL,
  "new_values" jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "store_subscription_plan_changes_timing_check"
    CHECK ("timing" IN ('immediate', 'next_renewal')),
  CONSTRAINT "store_subscription_plan_changes_status_check"
    CHECK ("status" IN ('scheduled', 'applied', 'cancelled')),
  CONSTRAINT "store_subscription_plan_changes_module_treatment_check"
    CHECK ("module_treatment" IN ('sync_to_new_plan', 'keep_current', 'manual_review')),
  CONSTRAINT "store_subscription_plan_changes_plan_diff_check"
    CHECK ("from_plan_id" <> "to_plan_id"),
  CONSTRAINT "store_subscription_plan_changes_applied_shape_check"
    CHECK (("status" = 'applied' AND "applied_at" IS NOT NULL) OR ("status" <> 'applied')),
  CONSTRAINT "store_subscription_plan_changes_cancelled_shape_check"
    CHECK (("status" = 'cancelled' AND "cancelled_at" IS NOT NULL) OR ("status" <> 'cancelled'))
);

DO $$
BEGIN
  ALTER TABLE "store_subscription_plan_changes"
    ADD CONSTRAINT "store_subscription_plan_changes_subscription_store_from_plan_fk"
    FOREIGN KEY ("subscription_id", "store_id", "from_plan_id")
    REFERENCES "store_subscriptions"("id", "store_id", "plan_id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "store_subscription_plan_changes_store_status_idx"
  ON "store_subscription_plan_changes" ("store_id", "status");

CREATE INDEX IF NOT EXISTS "store_subscription_plan_changes_subscription_idx"
  ON "store_subscription_plan_changes" ("subscription_id");

CREATE INDEX IF NOT EXISTS "store_subscription_plan_changes_applied_subscription_idx"
  ON "store_subscription_plan_changes" ("applied_subscription_id");

CREATE INDEX IF NOT EXISTS "store_subscription_plan_changes_effective_idx"
  ON "store_subscription_plan_changes" ("effective_at");

CREATE UNIQUE INDEX IF NOT EXISTS "store_subscription_plan_changes_one_scheduled_per_subscription_idx"
  ON "store_subscription_plan_changes" ("subscription_id")
  WHERE "status" = 'scheduled';

ALTER TABLE "store_subscription_plan_changes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_subscription_plan_changes" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "store_subscription_plan_changes" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "store_subscription_plan_changes_id_seq" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE "store_subscription_plan_changes" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "store_subscription_plan_changes_id_seq" TO service_role;

DO $$
BEGIN
  ALTER TABLE "internal_operation_audit_logs"
    DROP CONSTRAINT IF EXISTS "internal_operation_audit_logs_action_check";

  ALTER TABLE "internal_operation_audit_logs"
    ADD CONSTRAINT "internal_operation_audit_logs_action_check"
    CHECK (
      "action" IN (
        'create_store',
        'create_store_access_invite',
        'accept_store_access_invite',
        'update_store_profile',
        'update_store_implementation_checklist',
        'activate_store_after_implementation',
        'activate_store_commercial',
        'reactivate_store_commercial',
        'inactivate_store_commercial',
        'cancel_store_commercial',
        'block_store_access',
        'unblock_store_access',
        'update_store_subscription_terms',
        'change_store_subscription_plan',
        'reactivate_store',
        'archive_store'
      )
    );
END $$;

COMMENT ON TABLE "store_subscription_plan_changes" IS
  'Registra mudancas de plano imediatas ou programadas para auditoria e controle de vigencia.';

COMMENT ON COLUMN "store_subscription_plan_changes"."timing" IS
  'immediate aplica na hora; next_renewal preserva a assinatura ate a proxima cobranca.';

COMMENT ON COLUMN "store_subscription_plan_changes"."module_treatment" IS
  'Define como os modulos vinculados ao plano devem ser tratados quando a mudanca for aplicada.';
