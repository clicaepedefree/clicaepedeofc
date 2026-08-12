CREATE TABLE IF NOT EXISTS "billing_modules" (
  "id" serial PRIMARY KEY,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "billing_modules_code_unique" UNIQUE ("code"),
  CONSTRAINT "billing_modules_status_check" CHECK ("status" IN ('active', 'archived'))
);

CREATE TABLE IF NOT EXISTS "billing_plan_modules" (
  "id" serial PRIMARY KEY,
  "plan_id" integer NOT NULL REFERENCES "billing_plans"("id") ON DELETE no action ON UPDATE no action,
  "module_id" integer NOT NULL REFERENCES "billing_modules"("id") ON DELETE no action ON UPDATE no action,
  "status" text DEFAULT 'active' NOT NULL,
  "starts_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "ends_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "billing_plan_modules_status_check" CHECK ("status" IN ('active', 'inactive')),
  CONSTRAINT "billing_plan_modules_period_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at")
);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_plan_modules_one_active_per_plan_module_idx"
  ON "billing_plan_modules" ("plan_id", "module_id")
  WHERE "status" = 'active' AND "ends_at" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "billing_plan_modules_id_plan_module_unique"
  ON "billing_plan_modules" ("id", "plan_id", "module_id");

CREATE INDEX IF NOT EXISTS "billing_plan_modules_plan_status_idx"
  ON "billing_plan_modules" ("plan_id", "status");

CREATE INDEX IF NOT EXISTS "billing_plan_modules_module_idx"
  ON "billing_plan_modules" ("module_id");

CREATE UNIQUE INDEX IF NOT EXISTS "store_subscriptions_id_store_plan_unique"
  ON "store_subscriptions" ("id", "store_id", "plan_id");

CREATE TABLE IF NOT EXISTS "store_module_entitlements" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "module_id" integer NOT NULL REFERENCES "billing_modules"("id") ON DELETE no action ON UPDATE no action,
  "subscription_id" integer,
  "plan_id" integer REFERENCES "billing_plans"("id") ON DELETE no action ON UPDATE no action,
  "plan_module_id" integer,
  "origin" text NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "is_additional" boolean DEFAULT false NOT NULL,
  "additional_amount" numeric(19, 4) DEFAULT 0 NOT NULL,
  "currency" text DEFAULT 'BRL' NOT NULL,
  "starts_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "ends_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "reason" text,
  "actor_clerk_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "store_module_entitlements_origin_check" CHECK ("origin" IN ('plan', 'addon', 'courtesy', 'manual')),
  CONSTRAINT "store_module_entitlements_status_check" CHECK ("status" IN ('active', 'inactive', 'expired', 'revoked')),
  CONSTRAINT "store_module_entitlements_amount_non_negative_check" CHECK ("additional_amount" >= 0),
  CONSTRAINT "store_module_entitlements_additional_shape_check" CHECK (
    ("origin" = 'addon' AND "is_additional" = true)
    OR ("origin" != 'addon' AND "is_additional" = false AND "additional_amount" = 0)
  ),
  CONSTRAINT "store_module_entitlements_subscription_store_plan_fk"
    FOREIGN KEY ("subscription_id", "store_id", "plan_id")
    REFERENCES "store_subscriptions"("id", "store_id", "plan_id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "store_module_entitlements_plan_module_fk"
    FOREIGN KEY ("plan_module_id", "plan_id", "module_id")
    REFERENCES "billing_plan_modules"("id", "plan_id", "module_id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "store_module_entitlements_plan_shape_check" CHECK (
    "origin" != 'plan'
    OR (
      "subscription_id" IS NOT NULL
      AND "plan_id" IS NOT NULL
      AND "plan_module_id" IS NOT NULL
    )
  ),
  CONSTRAINT "store_module_entitlements_period_check" CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at"),
  CONSTRAINT "store_module_entitlements_revoked_shape_check" CHECK (
    ("status" = 'revoked' AND "revoked_at" IS NOT NULL)
    OR ("status" != 'revoked')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "store_module_entitlements_one_active_per_origin_idx"
  ON "store_module_entitlements" ("store_id", "module_id", "origin")
  WHERE "status" = 'active' AND "ends_at" IS NULL;

CREATE INDEX IF NOT EXISTS "store_module_entitlements_store_status_idx"
  ON "store_module_entitlements" ("store_id", "status");

CREATE INDEX IF NOT EXISTS "store_module_entitlements_module_idx"
  ON "store_module_entitlements" ("module_id");

CREATE INDEX IF NOT EXISTS "store_module_entitlements_subscription_idx"
  ON "store_module_entitlements" ("subscription_id");

CREATE OR REPLACE FUNCTION "reject_billing_plan_module_delete"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'billing_plan_modules preserves history; mark inactive instead of deleting'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION "reject_billing_plan_module_overlap"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."status" = 'active'
    AND EXISTS (
      SELECT 1
      FROM "billing_plan_modules" existing
      WHERE existing."id" <> NEW."id"
        AND existing."plan_id" = NEW."plan_id"
        AND existing."module_id" = NEW."module_id"
        AND existing."status" = 'active'
        AND tstzrange(existing."starts_at", COALESCE(existing."ends_at", 'infinity'::timestamptz), '[)')
          && tstzrange(NEW."starts_at", COALESCE(NEW."ends_at", 'infinity'::timestamptz), '[)')
    )
  THEN
    RAISE EXCEPTION 'billing_plan_modules active periods cannot overlap'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "reject_store_module_entitlement_delete"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'store_module_entitlements preserves history; revoke or deactivate instead of deleting'
    USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION "reject_store_module_entitlement_overlap"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW."status" = 'active'
    AND EXISTS (
      SELECT 1
      FROM "store_module_entitlements" existing
      WHERE existing."id" <> NEW."id"
        AND existing."store_id" = NEW."store_id"
        AND existing."module_id" = NEW."module_id"
        AND existing."origin" = NEW."origin"
        AND existing."status" = 'active'
        AND tstzrange(existing."starts_at", COALESCE(existing."ends_at", 'infinity'::timestamptz), '[)')
          && tstzrange(NEW."starts_at", COALESCE(NEW."ends_at", 'infinity'::timestamptz), '[)')
    )
  THEN
    RAISE EXCEPTION 'store_module_entitlements active periods cannot overlap'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION "reject_billing_plan_module_delete"() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION "reject_billing_plan_module_overlap"() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION "reject_store_module_entitlement_delete"() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION "reject_store_module_entitlement_overlap"() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS "billing_plan_modules_preserve_history" ON "billing_plan_modules";
DROP TRIGGER IF EXISTS "billing_plan_modules_reject_overlap" ON "billing_plan_modules";
DROP TRIGGER IF EXISTS "store_module_entitlements_preserve_history" ON "store_module_entitlements";
DROP TRIGGER IF EXISTS "store_module_entitlements_reject_overlap" ON "store_module_entitlements";

CREATE TRIGGER "billing_plan_modules_preserve_history"
BEFORE DELETE ON "billing_plan_modules"
FOR EACH ROW EXECUTE FUNCTION "reject_billing_plan_module_delete"();

CREATE TRIGGER "billing_plan_modules_reject_overlap"
BEFORE INSERT OR UPDATE ON "billing_plan_modules"
FOR EACH ROW EXECUTE FUNCTION "reject_billing_plan_module_overlap"();

CREATE TRIGGER "store_module_entitlements_preserve_history"
BEFORE DELETE ON "store_module_entitlements"
FOR EACH ROW EXECUTE FUNCTION "reject_store_module_entitlement_delete"();

CREATE TRIGGER "store_module_entitlements_reject_overlap"
BEFORE INSERT OR UPDATE ON "store_module_entitlements"
FOR EACH ROW EXECUTE FUNCTION "reject_store_module_entitlement_overlap"();

INSERT INTO "billing_modules" ("code", "name", "description")
VALUES
  ('digital_menu', 'Cardapio digital', 'Cardapio publico, checkout e acompanhamento de pedido.'),
  ('pos', 'Caixa / PDV', 'Operacao de caixa, pedidos presenciais e fechamento.'),
  ('reports', 'Relatorios', 'Indicadores operacionais e financeiros da loja.'),
  ('fiscal', 'Gestao fiscal', 'Notas fiscais, configuracoes fiscais e emissao integrada.'),
  ('ifood', 'Integracao iFood', 'Sincronizacao e operacao de pedidos iFood.'),
  ('whatsapp_bot', 'Bot de atendimento WhatsApp', 'Atendimento automatizado e notificacoes de pedido.'),
  ('loyalty', 'Fidelidade', 'Programa de fidelidade e beneficios recorrentes.'),
  ('cashback', 'Cashback', 'Carteira virtual e creditos promocionais.'),
  ('kitchen', 'Gestao de cozinha', 'Fluxo de preparo, status de cozinha e operacao de producao.')
ON CONFLICT ("code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "updated_at" = CURRENT_TIMESTAMP;

ALTER TABLE "billing_modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_plan_modules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_module_entitlements" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "billing_modules" FORCE ROW LEVEL SECURITY;
ALTER TABLE "billing_plan_modules" FORCE ROW LEVEL SECURITY;
ALTER TABLE "store_module_entitlements" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "billing_modules" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "billing_plan_modules" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "store_module_entitlements" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON SEQUENCE "billing_modules_id_seq" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "billing_plan_modules_id_seq" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "store_module_entitlements_id_seq" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE "billing_modules" TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE "billing_plan_modules" TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE "store_module_entitlements" TO service_role;

GRANT USAGE, SELECT ON SEQUENCE "billing_modules_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "billing_plan_modules_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "store_module_entitlements_id_seq" TO service_role;

COMMENT ON TABLE "billing_modules" IS
  'Administrative catalog of product modules controlled by billing and internal operations.';

COMMENT ON TABLE "billing_plan_modules" IS
  'Historical plan-to-module mapping. Deactivate rows instead of deleting them.';

COMMENT ON TABLE "store_module_entitlements" IS
  'Historical store module releases from plan, addon, courtesy, or manual exception.';
