CREATE TABLE IF NOT EXISTS "internal_operation_audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "action" text NOT NULL,
  "actor_clerk_id" text NOT NULL,
  "actor_email" text NOT NULL,
  "actor_name" text,
  "store_id" integer,
  "target_user_id" uuid,
  "target_user_email" text,
  "previous_store_status" text NOT NULL,
  "new_store_status" text NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "internal_operation_audit_logs"
    ADD CONSTRAINT "internal_operation_audit_logs_action_check"
    CHECK ("action" IN ('reactivate_store', 'archive_store'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "internal_operation_audit_logs"
    ADD CONSTRAINT "internal_operation_audit_logs_store_id_stores_id_fk"
    FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "internal_operation_audit_logs"
    ADD CONSTRAINT "internal_operation_audit_logs_target_user_id_users_id_fk"
    FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id")
    ON DELETE no action ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "internal_operation_audit_logs_store_idx"
  ON "internal_operation_audit_logs" ("store_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "internal_operation_audit_logs_actor_idx"
  ON "internal_operation_audit_logs" ("actor_email", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "internal_operation_audit_logs_action_idx"
  ON "internal_operation_audit_logs" ("action", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "stores_status_updated_at_idx"
  ON "stores" ("status", "status_updated_at" DESC);
