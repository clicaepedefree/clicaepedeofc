alter table "internal_operation_audit_logs"
  drop constraint if exists "internal_operation_audit_logs_action_check";

alter table "internal_operation_audit_logs"
  add constraint "internal_operation_audit_logs_action_check"
  check (
    "action" in (
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
      'connect_whatsapp_bot',
      'renew_whatsapp_bot_qr',
      'pause_whatsapp_bot',
      'disconnect_whatsapp_bot',
      'update_whatsapp_assistant_config',
      'return_whatsapp_conversation_to_bot',
      'prune_whatsapp_bot_history',
      'reactivate_store',
      'archive_store'
    )
  );

comment on column "whatsapp_bot_sessions"."metadata" is
  'Operational provider metadata for WhatsApp bot sessions. Provider tokens must remain encrypted as instanceTokenCiphertext and transient QR data is pruned after expiration, pause or disconnect.';

comment on column "whatsapp_bot_transactional_events"."payload" is
  'Delivery payload for transactional/promotional WhatsApp notifications. Promotional payloads must respect contact opt-out and operational data follows the WhatsApp bot retention policy.';

comment on column "whatsapp_bot_contacts"."promotional_opt_out_at" is
  'Timestamp used to block promotional WhatsApp messages while preserving transactional order updates.';
