CREATE TABLE IF NOT EXISTS "administrative_audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer,
  "scope" text NOT NULL,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text,
  "actor_clerk_id" text NOT NULL,
  "actor_email" text NOT NULL,
  "actor_name" text,
  "target_user_id" uuid,
  "target_user_email" text,
  "reason" text NOT NULL,
  "previous_values" jsonb,
  "new_values" jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "criticality" text DEFAULT 'required' NOT NULL,
  "status" text DEFAULT 'recorded' NOT NULL,
  "failure_message" text,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "administrative_audit_logs_scope_check" CHECK (
    "scope" IN (
      'store_data',
      'billing_plan',
      'module_entitlement',
      'billing_invoice',
      'access',
      'cancellation'
    )
  ),
  CONSTRAINT "administrative_audit_logs_action_check" CHECK (
    "action" IN (
      'create',
      'update',
      'delete',
      'reactivate',
      'archive',
      'block',
      'cancel',
      'restore',
      'grant',
      'revoke'
    )
  ),
  CONSTRAINT "administrative_audit_logs_criticality_check" CHECK (
    "criticality" IN ('best_effort', 'required')
  ),
  CONSTRAINT "administrative_audit_logs_status_check" CHECK (
    "status" IN ('recorded', 'failed')
  ),
  CONSTRAINT "administrative_audit_logs_reason_check" CHECK (
    nullif(btrim("reason"), '') IS NOT NULL
  ),
  CONSTRAINT "administrative_audit_logs_snapshot_check" CHECK (
    "previous_values" IS NOT NULL OR "new_values" IS NOT NULL
  ),
  CONSTRAINT "administrative_audit_logs_failure_check" CHECK (
    ("status" = 'recorded' AND "failure_message" IS NULL)
    OR ("status" = 'failed' AND nullif(btrim("failure_message"), '') IS NOT NULL)
  )
);

DO $$
BEGIN
  ALTER TABLE "administrative_audit_logs"
    ADD CONSTRAINT "administrative_audit_logs_store_id_stores_id_fk"
    FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "administrative_audit_logs"
    ADD CONSTRAINT "administrative_audit_logs_target_user_id_users_id_fk"
    FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "administrative_audit_logs_store_created_idx"
  ON "administrative_audit_logs" ("store_id", "created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "administrative_audit_logs_scope_created_idx"
  ON "administrative_audit_logs" ("scope", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "administrative_audit_logs_actor_created_idx"
  ON "administrative_audit_logs" ("actor_email", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "administrative_audit_logs_entity_idx"
  ON "administrative_audit_logs" ("entity_type", "entity_id");

CREATE OR REPLACE FUNCTION "reject_administrative_audit_log_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'administrative_audit_logs is append-only' USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION "reject_administrative_audit_log_mutation"() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "administrative_audit_logs_append_only"
  ON "administrative_audit_logs";
DROP TRIGGER IF EXISTS "administrative_audit_logs_no_truncate"
  ON "administrative_audit_logs";

CREATE TRIGGER "administrative_audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "administrative_audit_logs"
FOR EACH ROW EXECUTE FUNCTION "reject_administrative_audit_log_mutation"();

CREATE TRIGGER "administrative_audit_logs_no_truncate"
BEFORE TRUNCATE ON "administrative_audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_administrative_audit_log_mutation"();

ALTER TABLE "administrative_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "administrative_audit_logs" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "administrative_audit_logs" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "administrative_audit_logs_id_seq" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE "administrative_audit_logs" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "administrative_audit_logs_id_seq" TO service_role;

COMMENT ON TABLE "administrative_audit_logs" IS
  'Append-only administrative audit trail for sensitive internal actions. No public policies or UPDATE/DELETE grants.';
