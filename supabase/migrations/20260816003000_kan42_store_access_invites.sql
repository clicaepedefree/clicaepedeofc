CREATE TABLE IF NOT EXISTS "store_access_invites" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade,
  "target_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
  "target_email" text NOT NULL,
  "role" text DEFAULT 'admin' NOT NULL,
  "token_hash" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "delivery_channel" text DEFAULT 'manual' NOT NULL,
  "delivery_status" text DEFAULT 'ready' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_by_clerk_id" text NOT NULL,
  "created_by_email" text NOT NULL,
  "accepted_by_clerk_id" text,
  "accepted_by_email" text,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "store_access_invites_role_check" CHECK ("role" IN ('admin')),
  CONSTRAINT "store_access_invites_status_check" CHECK ("status" IN ('pending', 'used', 'revoked')),
  CONSTRAINT "store_access_invites_delivery_channel_check" CHECK ("delivery_channel" IN ('manual', 'email', 'whatsapp')),
  CONSTRAINT "store_access_invites_delivery_status_check" CHECK ("delivery_status" IN ('pending', 'ready', 'sent', 'failed')),
  CONSTRAINT "store_access_invites_expiration_check" CHECK ("expires_at" > "created_at")
);

CREATE UNIQUE INDEX IF NOT EXISTS "store_access_invites_token_hash_unique"
  ON "store_access_invites" ("token_hash");

CREATE INDEX IF NOT EXISTS "store_access_invites_store_email_idx"
  ON "store_access_invites" ("store_id", "target_email");

CREATE INDEX IF NOT EXISTS "store_access_invites_status_expires_idx"
  ON "store_access_invites" ("status", "expires_at");

CREATE INDEX IF NOT EXISTS "store_access_invites_one_pending_per_store_email_idx"
  ON "store_access_invites" ("store_id", lower("target_email"))
  WHERE "status" = 'pending';

ALTER TABLE "store_access_invites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_access_invites" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "store_access_invites" FROM anon, authenticated;
GRANT ALL ON TABLE "store_access_invites" TO service_role;

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
      'reactivate_store',
      'archive_store'
    ));
END $$;
