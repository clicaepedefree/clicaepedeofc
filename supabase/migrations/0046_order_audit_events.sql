CREATE UNIQUE INDEX IF NOT EXISTS "orders_id_store_id_unique"
  ON "orders" ("id", "store_id");

CREATE TABLE "order_audit_events" (
  "id" serial PRIMARY KEY,
  "order_id" integer NOT NULL,
  "store_id" integer NOT NULL,
  "event_type" text NOT NULL,
  "from_status" text,
  "to_status" text,
  "actor_type" text,
  "actor_user_id" text,
  "origin" text NOT NULL,
  "reason" text,
  "request_id" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "ip_hash" text,
  "user_agent_hash" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT current_timestamp,
  CONSTRAINT "order_audit_events_order_store_fk"
    FOREIGN KEY ("order_id", "store_id")
    REFERENCES "orders" ("id", "store_id") ON DELETE RESTRICT,
  CONSTRAINT "order_audit_events_store_fk"
    FOREIGN KEY ("store_id") REFERENCES "stores" ("id") ON DELETE RESTRICT,
  CONSTRAINT "order_audit_events_event_type_check"
    CHECK ("event_type" IN ('order_created', 'historical_snapshot', 'status_changed', 'note_added')),
  CONSTRAINT "order_audit_events_actor_type_check"
    CHECK ("actor_type" IN ('store', 'customer', 'system')),
  CONSTRAINT "order_audit_events_actor_presence_check"
    CHECK ("actor_type" IS NOT NULL OR "origin" = 'SYSTEM'),
  CONSTRAINT "order_audit_events_store_actor_check"
    CHECK ("actor_type" <> 'store' OR "actor_user_id" IS NOT NULL),
  CONSTRAINT "order_audit_events_origin_check"
    CHECK ("origin" IN ('POS', 'DIGITAL_MENU', 'MANUAL', 'SYSTEM')),
  CONSTRAINT "order_audit_events_from_status_check" CHECK (
    "from_status" IS NULL OR "from_status" IN (
      'PENDING', 'COMPLETED', 'CANCELLED', 'CREATED', 'SENT_TO_STORE',
      'RECEIVED', 'ACCEPTED', 'REJECTED'
    )
  ),
  CONSTRAINT "order_audit_events_to_status_check" CHECK (
    "to_status" IS NULL OR "to_status" IN (
      'PENDING', 'COMPLETED', 'CANCELLED', 'CREATED', 'SENT_TO_STORE',
      'RECEIVED', 'ACCEPTED', 'REJECTED'
    )
  ),
  CONSTRAINT "order_audit_events_status_shape_check" CHECK (
    ("event_type" IN ('order_created', 'historical_snapshot') AND "from_status" IS NULL AND "to_status" IS NOT NULL)
    OR ("event_type" = 'status_changed' AND "from_status" IS NOT NULL AND "to_status" IS NOT NULL)
    OR ("event_type" = 'note_added' AND "from_status" IS NULL AND "to_status" IS NULL)
  ),
  CONSTRAINT "order_audit_events_reason_check" CHECK (
    ("event_type" <> 'note_added' OR nullif(btrim("reason"), '') IS NOT NULL)
    AND ("event_type" <> 'status_changed' OR "to_status" NOT IN ('REJECTED', 'CANCELLED') OR nullif(btrim("reason"), '') IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "order_audit_events_request_id_unique"
  ON "order_audit_events" ("request_id");
CREATE INDEX "order_audit_events_order_store_created_idx"
  ON "order_audit_events" ("order_id", "store_id", "created_at");
CREATE INDEX "order_audit_events_store_created_idx"
  ON "order_audit_events" ("store_id", "created_at");

CREATE OR REPLACE FUNCTION "reject_order_audit_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'order_audit_events is append-only' USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION "reject_order_audit_event_mutation"() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER "order_audit_events_append_only"
BEFORE UPDATE OR DELETE ON "order_audit_events"
FOR EACH ROW EXECUTE FUNCTION "reject_order_audit_event_mutation"();

INSERT INTO "order_audit_events" (
  "order_id", "store_id", "event_type", "from_status", "to_status",
  "actor_type", "origin", "request_id", "metadata", "created_at"
)
SELECT
  o."id", o."store_id", 'historical_snapshot', NULL, o."status",
  NULL, 'SYSTEM', 'backfill-order-snapshot-' || o."id", '{}'::jsonb, current_timestamp
FROM "orders" o
ON CONFLICT ("request_id") DO NOTHING;

ALTER TABLE "order_audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_audit_events" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "order_audit_events" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "order_audit_events_id_seq" FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE "order_audit_events" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "order_audit_events_id_seq" TO service_role;

COMMENT ON TABLE "order_audit_events" IS
  'Append-only backend audit trail. No public policies or UPDATE/DELETE grants.';

ALTER TABLE "public_order_submissions"
  DROP CONSTRAINT IF EXISTS "public_order_submissions_status_check",
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone,
  ADD CONSTRAINT "public_order_submissions_status_check" CHECK (
    "status" IN ('PENDING', 'CREATED', 'SENT_TO_STORE', 'RECEIVED', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED')
  );
