ALTER TABLE "order_audit_events"
  DROP CONSTRAINT IF EXISTS "order_audit_events_from_status_check",
  DROP CONSTRAINT IF EXISTS "order_audit_events_to_status_check",
  ADD CONSTRAINT "order_audit_events_from_status_check" CHECK (
    "from_status" IS NULL OR "from_status" IN (
      'PENDING', 'COMPLETED', 'CANCELLED', 'CREATED', 'SENT_TO_STORE',
      'RECEIVED', 'ACCEPTED', 'IN_PREPARATION', 'READY', 'OUT_FOR_DELIVERY',
      'REJECTED'
    )
  ),
  ADD CONSTRAINT "order_audit_events_to_status_check" CHECK (
    "to_status" IS NULL OR "to_status" IN (
      'PENDING', 'COMPLETED', 'CANCELLED', 'CREATED', 'SENT_TO_STORE',
      'RECEIVED', 'ACCEPTED', 'IN_PREPARATION', 'READY', 'OUT_FOR_DELIVERY',
      'REJECTED'
    )
  );

ALTER TABLE "public_order_submissions"
  DROP CONSTRAINT IF EXISTS "public_order_submissions_status_check",
  ADD CONSTRAINT "public_order_submissions_status_check" CHECK (
    "status" IN (
      'PENDING', 'CREATED', 'SENT_TO_STORE', 'RECEIVED', 'ACCEPTED',
      'IN_PREPARATION', 'READY', 'OUT_FOR_DELIVERY',
      'REJECTED', 'CANCELLED', 'COMPLETED'
    )
  );
