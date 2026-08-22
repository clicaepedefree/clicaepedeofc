-- KAN-78: reconcile production role drift for store users and invites.
--
-- Production briefly accepted only the legacy `admin` role while the
-- application/schema now use `owner`, `manager`, `attendant`, `cashier`,
-- `waiter`, and `courier`. Keep this migration idempotent because some
-- environments may already have KAN-67 applied while production did not.

ALTER TABLE "user_store_permissions"
  DROP CONSTRAINT IF EXISTS "user_store_permissions_role_check";

ALTER TABLE "store_access_invites"
  DROP CONSTRAINT IF EXISTS "store_access_invites_role_check";

UPDATE "user_store_permissions"
SET
  "role" = 'owner',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "role" = 'admin';

UPDATE "store_access_invites"
SET
  "role" = 'owner',
  "updated_at" = CURRENT_TIMESTAMP
WHERE "role" = 'admin';

ALTER TABLE "user_store_permissions"
  ADD CONSTRAINT "user_store_permissions_role_check"
  CHECK ("role" IN ('owner', 'manager', 'attendant', 'cashier', 'waiter', 'courier'));

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
  'Built-in store access profile. Legacy admin values are reconciled to owner.';

COMMENT ON COLUMN "store_access_invites"."role" IS
  'Built-in store access profile assigned when the invite is accepted. Defaults to manager.';
