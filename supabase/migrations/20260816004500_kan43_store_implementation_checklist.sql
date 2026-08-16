ALTER TABLE "stores"
  DROP CONSTRAINT IF EXISTS "stores_status_check";

ALTER TABLE "stores"
  ADD CONSTRAINT "stores_status_check"
  CHECK ("status" IN ('implementing', 'active', 'inactive', 'pending_recovery', 'archived'));

CREATE TABLE IF NOT EXISTS "store_implementation_checklist_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade,
  "item_key" text NOT NULL,
  "title" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "required_for_activation" boolean DEFAULT true NOT NULL,
  "completed_at" timestamp with time zone,
  "completed_by_clerk_id" text,
  "completed_by_email" text,
  "completed_by_name" text,
  "observation" text,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "store_implementation_checklist_items_key_check"
    CHECK ("item_key" IN ('menu', 'integrations', 'payments', 'test_order', 'training')),
  CONSTRAINT "store_implementation_checklist_items_status_check"
    CHECK ("status" IN ('pending', 'completed')),
  CONSTRAINT "store_implementation_checklist_items_completion_check"
    CHECK (
      ("status" = 'completed' AND "completed_at" IS NOT NULL AND "completed_by_clerk_id" IS NOT NULL AND "completed_by_email" IS NOT NULL)
      OR ("status" = 'pending')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "store_implementation_checklist_items_store_item_unique"
  ON "store_implementation_checklist_items" ("store_id", "item_key");

CREATE INDEX IF NOT EXISTS "store_implementation_checklist_items_store_status_idx"
  ON "store_implementation_checklist_items" ("store_id", "status");

CREATE TABLE IF NOT EXISTS "store_implementation_checklist_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade,
  "checklist_item_id" integer NOT NULL REFERENCES "store_implementation_checklist_items"("id") ON DELETE cascade,
  "item_key" text NOT NULL,
  "previous_status" text NOT NULL,
  "new_status" text NOT NULL,
  "actor_clerk_id" text NOT NULL,
  "actor_email" text NOT NULL,
  "actor_name" text,
  "observation" text,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "store_implementation_checklist_events_item_key_check"
    CHECK ("item_key" IN ('menu', 'integrations', 'payments', 'test_order', 'training')),
  CONSTRAINT "store_implementation_checklist_events_previous_status_check"
    CHECK ("previous_status" IN ('pending', 'completed')),
  CONSTRAINT "store_implementation_checklist_events_new_status_check"
    CHECK ("new_status" IN ('pending', 'completed'))
);

CREATE INDEX IF NOT EXISTS "store_implementation_checklist_events_store_created_idx"
  ON "store_implementation_checklist_events" ("store_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "store_implementation_checklist_events_item_idx"
  ON "store_implementation_checklist_events" ("checklist_item_id", "created_at" DESC);

INSERT INTO "store_implementation_checklist_items" (
  "store_id",
  "item_key",
  "title",
  "required_for_activation",
  "updated_at"
)
SELECT
  "stores"."id",
  "definition"."item_key",
  "definition"."title",
  true,
  CURRENT_TIMESTAMP
FROM "stores"
CROSS JOIN (
  VALUES
    ('menu', 'Cardapio criado e revisado'),
    ('integrations', 'Integracoes configuradas ou registradas como pendentes'),
    ('payments', 'Pagamentos configurados e validados'),
    ('test_order', 'Pedido teste realizado com sucesso'),
    ('training', 'Treinamento inicial concluido com o cliente')
) AS "definition"("item_key", "title")
ON CONFLICT ("store_id", "item_key") DO NOTHING;

ALTER TABLE "store_implementation_checklist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_implementation_checklist_items" FORCE ROW LEVEL SECURITY;
ALTER TABLE "store_implementation_checklist_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_implementation_checklist_events" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "store_implementation_checklist_items" FROM anon, authenticated;
REVOKE ALL ON TABLE "store_implementation_checklist_events" FROM anon, authenticated;
GRANT ALL ON TABLE "store_implementation_checklist_items" TO service_role;
GRANT ALL ON TABLE "store_implementation_checklist_events" TO service_role;

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
      'update_store_implementation_checklist',
      'activate_store_after_implementation',
      'reactivate_store',
      'archive_store'
    ));
END $$;
