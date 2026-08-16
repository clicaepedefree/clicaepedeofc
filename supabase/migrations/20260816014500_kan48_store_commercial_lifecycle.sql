ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp,
  ADD COLUMN IF NOT EXISTS "cancellation_reason" text;

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
      'reactivate_store',
      'archive_store'
    ));
END $$;

COMMENT ON COLUMN "stores"."cancelled_at" IS
  'Commercial cancellation timestamp. Historical store data must be preserved.';

COMMENT ON COLUMN "stores"."cancellation_reason" IS
  'Required business reason captured when the internal team cancels a store commercially.';
