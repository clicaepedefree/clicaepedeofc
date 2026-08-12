-- KAN-32: base administrativa de lojas.
-- Rollback manual seguro, se a migracao precisar ser revertida antes de
-- features dependerem da nova estrutura. A restauracao de grants/RLS antigos
-- deve seguir a politica de seguranca vigente no ambiente:
--   DROP TABLE IF EXISTS "store_addresses";
--   DROP INDEX IF EXISTS "user_store_permissions_one_primary_responsible_idx";
--   DROP INDEX IF EXISTS "user_store_permissions_store_id_idx";
--   ALTER TABLE "user_store_permissions"
--     DROP CONSTRAINT IF EXISTS "user_store_permissions_role_check";
--   ALTER TABLE "user_store_permissions"
--     DROP COLUMN IF EXISTS "assigned_primary_at",
--     DROP COLUMN IF EXISTS "is_primary_responsible";

ALTER TABLE "user_store_permissions"
  ADD COLUMN IF NOT EXISTS "is_primary_responsible" boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS "assigned_primary_at" timestamp with time zone;

DO $$
BEGIN
  ALTER TABLE "user_store_permissions"
    ADD CONSTRAINT "user_store_permissions_role_check"
    CHECK ("role" IN ('admin'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

WITH ranked_active_admins AS (
  SELECT
    "user_id",
    "store_id",
    row_number() OVER (
      PARTITION BY "store_id"
      ORDER BY "created_at" ASC, "user_id" ASC
    ) AS primary_rank
  FROM "user_store_permissions"
  WHERE "role" = 'admin'
    AND "revoked_at" IS NULL
)
UPDATE "user_store_permissions" permission
SET
  "is_primary_responsible" = true,
  "assigned_primary_at" = COALESCE(
    permission."assigned_primary_at",
    permission."created_at",
    CURRENT_TIMESTAMP
  )
FROM ranked_active_admins ranked
WHERE permission."user_id" = ranked."user_id"
  AND permission."store_id" = ranked."store_id"
  AND ranked.primary_rank = 1
  AND permission."is_primary_responsible" = false;

CREATE INDEX IF NOT EXISTS "user_store_permissions_store_id_idx"
  ON "user_store_permissions" ("store_id");

CREATE UNIQUE INDEX IF NOT EXISTS "user_store_permissions_one_primary_responsible_idx"
  ON "user_store_permissions" ("store_id")
  WHERE "is_primary_responsible" = true
    AND "revoked_at" IS NULL
    AND "role" = 'admin';

ALTER TABLE "user_store_permissions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "user_store_permissions" FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS "store_addresses" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade,
  "address_type" text DEFAULT 'business' NOT NULL,
  "label" text,
  "postal_code" text,
  "street" text,
  "number" text,
  "complement" text,
  "district" text,
  "city" text,
  "state_code" text,
  "reference" text,
  "is_primary" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "store_addresses"
    ADD CONSTRAINT "store_addresses_address_type_check"
    CHECK ("address_type" IN ('business', 'billing', 'pickup', 'delivery_origin'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO "store_addresses" (
  "store_id",
  "address_type",
  "label",
  "postal_code",
  "street",
  "number",
  "district",
  "city",
  "state_code",
  "is_primary",
  "created_at",
  "updated_at"
)
SELECT
  profile."store_id",
  'business',
  'Endereco principal',
  profile."postal_code",
  profile."street",
  profile."number",
  profile."district",
  profile."city",
  profile."state_code",
  true,
  COALESCE(profile."created_at", CURRENT_TIMESTAMP),
  COALESCE(profile."updated_at", CURRENT_TIMESTAMP)
FROM "store_company_profiles" profile
WHERE (
    profile."postal_code" IS NOT NULL
    OR profile."street" IS NOT NULL
    OR profile."number" IS NOT NULL
    OR profile."district" IS NOT NULL
    OR profile."city" IS NOT NULL
    OR profile."state_code" IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "store_addresses" address
    WHERE address."store_id" = profile."store_id"
      AND address."address_type" = 'business'
      AND address."is_primary" = true
  );

CREATE INDEX IF NOT EXISTS "store_addresses_store_id_idx"
  ON "store_addresses" ("store_id");

CREATE UNIQUE INDEX IF NOT EXISTS "store_addresses_one_primary_per_type_idx"
  ON "store_addresses" ("store_id", "address_type")
  WHERE "is_primary" = true;

ALTER TABLE "store_addresses" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "store_addresses" FROM anon, authenticated;
REVOKE ALL ON SEQUENCE "store_addresses_id_seq" FROM anon, authenticated;
