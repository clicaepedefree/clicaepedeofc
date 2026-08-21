-- KAN-69: bloqueio individual de usuario por loja.

CREATE TABLE IF NOT EXISTS "store_user_access_blocks" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL,
  "user_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "notification_channel" text DEFAULT 'none' NOT NULL,
  "notification_note" text,
  "blocked_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "blocked_by_clerk_id" text NOT NULL,
  "blocked_by_email" text NOT NULL,
  "blocked_by_name" text,
  "unblocked_at" timestamp with time zone,
  "unblocked_by_clerk_id" text,
  "unblocked_by_email" text,
  "unblocked_by_name" text,
  "unblock_reason" text,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "store_user_access_blocks"
    ADD CONSTRAINT "store_user_access_blocks_store_id_stores_id_fk"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "store_user_access_blocks"
    ADD CONSTRAINT "store_user_access_blocks_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "store_user_access_blocks"
  DROP CONSTRAINT IF EXISTS "store_user_access_blocks_notification_channel_check";

ALTER TABLE "store_user_access_blocks"
  ADD CONSTRAINT "store_user_access_blocks_notification_channel_check"
  CHECK ("notification_channel" IN ('none', 'email', 'whatsapp', 'manual'));

CREATE INDEX IF NOT EXISTS "store_user_access_blocks_store_user_idx"
  ON "store_user_access_blocks" ("store_id", "user_id", "blocked_at");

CREATE INDEX IF NOT EXISTS "store_user_access_blocks_user_idx"
  ON "store_user_access_blocks" ("user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "store_user_access_blocks_one_active_idx"
  ON "store_user_access_blocks" ("store_id", "user_id")
  WHERE "unblocked_at" IS NULL;

ALTER TABLE "store_user_access_blocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_user_access_blocks" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "store_user_access_blocks" FROM anon;
REVOKE ALL ON TABLE "store_user_access_blocks" FROM authenticated;
GRANT ALL ON TABLE "store_user_access_blocks" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "store_user_access_blocks_id_seq" TO service_role;

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
