ALTER TABLE "users" ALTER COLUMN "clerk_id" DROP NOT NULL;

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL,
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "last_login_at" timestamp with time zone;

ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active' NOT NULL,
  ADD COLUMN IF NOT EXISTS "status_reason" text,
  ADD COLUMN IF NOT EXISTS "status_updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL;

ALTER TABLE "user_store_permissions"
  ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "revoked_reason" text;

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_email_unique";

DO $$
BEGIN
  ALTER TABLE "users"
    ADD CONSTRAINT "users_status_check"
    CHECK ("status" IN ('active', 'deleted'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "stores"
    ADD CONSTRAINT "stores_status_check"
    CHECK ("status" IN ('active', 'inactive', 'pending_recovery', 'archived'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "users_active_email_unique_idx"
  ON "users" (lower("email"))
  WHERE "status" = 'active';

CREATE INDEX IF NOT EXISTS "users_status_idx" ON "users" ("status");
CREATE INDEX IF NOT EXISTS "stores_status_idx" ON "stores" ("status");
CREATE INDEX IF NOT EXISTS "user_store_permissions_active_idx"
  ON "user_store_permissions" ("user_id", "store_id", "role")
  WHERE "revoked_at" IS NULL;
