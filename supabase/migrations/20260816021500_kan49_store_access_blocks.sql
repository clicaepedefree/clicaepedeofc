CREATE TABLE IF NOT EXISTS "store_access_blocks" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "reason" text NOT NULL,
  "notify_store_owner" boolean NOT NULL DEFAULT false,
  "notification_note" text,
  "scheduled_unblock_at" timestamp,
  "blocked_at" timestamp NOT NULL DEFAULT now(),
  "blocked_by_clerk_id" text NOT NULL,
  "blocked_by_email" text NOT NULL,
  "blocked_by_name" text,
  "unblocked_at" timestamp,
  "unblocked_by_clerk_id" text,
  "unblocked_by_email" text,
  "unblocked_by_name" text,
  "unblock_reason" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL,
  CONSTRAINT "store_access_blocks_reason_length_check" CHECK (length(trim("reason")) >= 8),
  CONSTRAINT "store_access_blocks_scheduled_unblock_check" CHECK (
    "scheduled_unblock_at" IS NULL OR "scheduled_unblock_at" > "blocked_at"
  ),
  CONSTRAINT "store_access_blocks_unblock_shape_check" CHECK (
    (
      "unblocked_at" IS NULL
      AND "unblocked_by_clerk_id" IS NULL
      AND "unblocked_by_email" IS NULL
      AND "unblocked_by_name" IS NULL
      AND "unblock_reason" IS NULL
    )
    OR
    (
      "unblocked_at" IS NOT NULL
      AND "unblocked_by_clerk_id" IS NOT NULL
      AND "unblocked_by_email" IS NOT NULL
      AND length(trim("unblock_reason")) >= 8
    )
  )
);

CREATE INDEX IF NOT EXISTS "store_access_blocks_store_blocked_idx"
  ON "store_access_blocks" ("store_id", "blocked_at");

CREATE INDEX IF NOT EXISTS "store_access_blocks_scheduled_unblock_idx"
  ON "store_access_blocks" ("scheduled_unblock_at");

DO $$
BEGIN
  ALTER TABLE "internal_operation_audit_logs"
    DROP CONSTRAINT IF EXISTS "internal_operation_audit_logs_action_check";

  ALTER TABLE "internal_operation_audit_logs"
    ADD CONSTRAINT "internal_operation_audit_logs_action_check"
    CHECK ("action" IN (
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
      'reactivate_store',
      'archive_store'
    ));
END $$;

ALTER TABLE "store_access_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_access_blocks" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "store_access_blocks" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "store_access_blocks_id_seq" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE "store_access_blocks" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "store_access_blocks_id_seq" TO service_role;

COMMENT ON TABLE "store_access_blocks" IS
  'Historical manual support blocks for store protected access. Does not alter commercial status or billing automatically.';
