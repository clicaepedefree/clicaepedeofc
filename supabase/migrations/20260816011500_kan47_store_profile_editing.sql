ALTER TABLE "store_company_profiles"
  ADD COLUMN IF NOT EXISTS "acquisition_source" text,
  ADD COLUMN IF NOT EXISTS "sales_owner" text,
  ADD COLUMN IF NOT EXISTS "internal_notes" text;

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
      'reactivate_store',
      'archive_store'
    ));
END $$;
