-- KAN-113: restore missing KAN-68 password reset schema without regressing newer audit actions.

CREATE TABLE IF NOT EXISTS "store_user_password_reset_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "store_id" integer NOT NULL,
  "target_user_id" uuid NOT NULL,
  "target_email" text NOT NULL,
  "target_clerk_id" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "requested_by_clerk_id" text NOT NULL,
  "requested_by_email" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "store_user_password_reset_requests"
    ADD CONSTRAINT "store_user_password_reset_requests_store_id_stores_id_fk"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "store_user_password_reset_requests"
    ADD CONSTRAINT "store_user_password_reset_requests_target_user_id_users_id_fk"
    FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "store_user_password_reset_requests"
  DROP CONSTRAINT IF EXISTS "store_user_password_reset_requests_status_check";

ALTER TABLE "store_user_password_reset_requests"
  ADD CONSTRAINT "store_user_password_reset_requests_status_check"
  CHECK ("status" IN ('pending', 'consumed', 'completed', 'revoked', 'expired'));

CREATE INDEX IF NOT EXISTS "store_user_password_reset_requests_store_idx"
  ON "store_user_password_reset_requests" ("store_id", "created_at");

CREATE INDEX IF NOT EXISTS "store_user_password_reset_requests_target_idx"
  ON "store_user_password_reset_requests" ("target_user_id", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "store_user_password_reset_requests_one_pending_idx"
  ON "store_user_password_reset_requests" ("store_id", "target_user_id")
  WHERE "status" IN ('pending', 'consumed')
    AND "revoked_at" IS NULL
    AND "completed_at" IS NULL;

DROP INDEX IF EXISTS "store_access_invites_one_pending_per_store_email_idx";

WITH ranked_pending_invites AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "store_id", lower("target_email")
      ORDER BY "created_at" DESC, "id" DESC
    ) AS "rank"
  FROM "store_access_invites"
  WHERE "status" = 'pending'
    AND "used_at" IS NULL
    AND "revoked_at" IS NULL
)
UPDATE "store_access_invites"
SET
  "status" = 'revoked',
  "revoked_at" = COALESCE("revoked_at", CURRENT_TIMESTAMP),
  "updated_at" = CURRENT_TIMESTAMP
FROM ranked_pending_invites
WHERE "store_access_invites"."id" = ranked_pending_invites."id"
  AND ranked_pending_invites."rank" > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "store_access_invites_one_pending_per_store_email_idx"
  ON "store_access_invites" ("store_id", lower("target_email"))
  WHERE "status" = 'pending'
    AND "used_at" IS NULL
    AND "revoked_at" IS NULL;

ALTER TABLE "store_user_password_reset_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_user_password_reset_requests" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "store_user_password_reset_requests" FROM anon;
REVOKE ALL ON TABLE "store_user_password_reset_requests" FROM authenticated;
GRANT ALL ON TABLE "store_user_password_reset_requests" TO service_role;

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
      'update_store_subscription_terms',
      'change_store_subscription_plan',
      'create_manual_billing_invoice',
      'mark_manual_billing_invoice_payment',
      'reschedule_billing_invoice_due_date',
      'adjust_billing_invoice_amount',
      'cancel_billing_invoice',
      'refund_billing_invoice',
      'auto_unblock_billing_access',
      'manage_store_module_entitlement',
      'create_store_user_invite',
      'resend_store_user_invite',
      'update_store_user',
      'block_store_user_access',
      'unblock_store_user_access',
      'revoke_store_user',
      'request_store_user_password_reset',
      'consume_store_user_password_reset',
      'complete_store_user_password_reset',
      'transfer_store_primary_responsible',
      'reactivate_store',
      'archive_store'
    ));
END $$;
