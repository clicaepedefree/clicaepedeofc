ALTER TABLE "store_billing_payments"
  ADD COLUMN IF NOT EXISTS "confirmation_key" text;

CREATE UNIQUE INDEX IF NOT EXISTS "store_billing_payments_confirmation_key_unique"
  ON "store_billing_payments" ("confirmation_key")
  WHERE "confirmation_key" IS NOT NULL;

DO $$
BEGIN
  ALTER TABLE "store_billing_events"
    DROP CONSTRAINT IF EXISTS "store_billing_events_type_check";

  ALTER TABLE "store_billing_events"
    DROP CONSTRAINT IF EXISTS "store_billing_events_event_type_check";

  ALTER TABLE "store_billing_events"
    ADD CONSTRAINT "store_billing_events_event_type_check"
    CHECK ("event_type" IN (
      'subscription_created',
      'subscription_changed',
      'subscription_cancelled',
      'invoice_created',
      'invoice_status_changed',
      'payment_registered',
      'payment_confirmed',
      'payment_failed',
      'refund_registered',
      'billing_adjustment_created',
      'billing_reminder_sent',
      'billing_access_blocked',
      'billing_access_unblocked'
    ));

  ALTER TABLE "store_billing_payments"
    DROP CONSTRAINT IF EXISTS "store_billing_payments_provider_pair_check";

  ALTER TABLE "store_billing_payments"
    ADD CONSTRAINT "store_billing_payments_provider_pair_check"
    CHECK (
      ("provider" IS NULL AND "provider_payment_id" IS NULL)
      OR "provider" IS NOT NULL
    );

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
      'reactivate_store',
      'archive_store'
    ));
END $$;

COMMENT ON COLUMN "store_billing_payments"."confirmation_key" IS
  'Stable idempotency key for payment confirmation events, including gateway webhooks and manual payment retries.';
