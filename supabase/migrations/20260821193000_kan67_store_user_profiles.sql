-- KAN-67: perfis de acesso por loja.

UPDATE "user_store_permissions"
SET "role" = 'owner'
WHERE "role" = 'admin';

UPDATE "store_access_invites"
SET "role" = 'owner'
WHERE "role" = 'admin';

ALTER TABLE "user_store_permissions"
  DROP CONSTRAINT IF EXISTS "user_store_permissions_role_check";

ALTER TABLE "user_store_permissions"
  ADD CONSTRAINT "user_store_permissions_role_check"
  CHECK ("role" IN ('owner', 'manager', 'attendant', 'cashier', 'waiter', 'courier'));

ALTER TABLE "store_access_invites"
  DROP CONSTRAINT IF EXISTS "store_access_invites_role_check";

ALTER TABLE "store_access_invites"
  ADD CONSTRAINT "store_access_invites_role_check"
  CHECK ("role" IN ('owner', 'manager', 'attendant', 'cashier', 'waiter', 'courier'));

ALTER TABLE "store_access_invites"
  ALTER COLUMN "role" SET DEFAULT 'manager';

DROP INDEX IF EXISTS "user_store_permissions_one_primary_responsible_idx";

CREATE UNIQUE INDEX "user_store_permissions_one_primary_responsible_idx"
  ON "user_store_permissions" ("store_id")
  WHERE "is_primary_responsible" = true
    AND "revoked_at" IS NULL
    AND "role" = 'owner';

COMMENT ON COLUMN "user_store_permissions"."role" IS
  'Built-in store access profile. Custom profiles should be introduced through a profile table that maps to this permission model.';

COMMENT ON COLUMN "store_access_invites"."role" IS
  'Built-in store access profile assigned when the invite is accepted.';
