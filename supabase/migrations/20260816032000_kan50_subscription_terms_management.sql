ALTER TABLE "store_subscriptions"
  ADD COLUMN IF NOT EXISTS "discount_valid_until" timestamp,
  ADD COLUMN IF NOT EXISTS "payment_grace_days" integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE "store_subscriptions"
    DROP CONSTRAINT IF EXISTS "store_subscriptions_discount_validity_pair_check";

  ALTER TABLE "store_subscriptions"
    ADD CONSTRAINT "store_subscriptions_discount_validity_pair_check"
    CHECK (
      "discount_valid_until" IS NULL
      OR ("discount_type" IS NOT NULL AND "discount_value" IS NOT NULL)
    );

  ALTER TABLE "store_subscriptions"
    DROP CONSTRAINT IF EXISTS "store_subscriptions_payment_grace_days_check";

  ALTER TABLE "store_subscriptions"
    ADD CONSTRAINT "store_subscriptions_payment_grace_days_check"
    CHECK ("payment_grace_days" >= 0 AND "payment_grace_days" <= 90);
END $$;

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
      'reactivate_store',
      'archive_store'
    ));
END $$;

COMMENT ON COLUMN "store_subscriptions"."discount_valid_until" IS
  'Optional expiration date for the store-specific contracted discount.';

COMMENT ON COLUMN "store_subscriptions"."payment_grace_days" IS
  'Store-specific tolerance days after next billing date before expected access block.';
