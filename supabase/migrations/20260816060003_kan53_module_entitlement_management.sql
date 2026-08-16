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
        'manage_store_module_entitlement',
        'reactivate_store',
        'archive_store'
      )
    );
END $$;

COMMENT ON TABLE "store_module_entitlements" IS
  'Historical store module releases from plan, addon, courtesy, or manual exception. Internal operations must revoke or expire rows instead of deleting them.';
