CREATE TABLE IF NOT EXISTS "whatsapp_bot_numbers" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "provider" text DEFAULT 'evolution' NOT NULL,
  "provider_number_id" text,
  "phone_number" text NOT NULL,
  "display_name" text,
  "status" text DEFAULT 'inactive' NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "whatsapp_bot_numbers_store_phone_unique"
    UNIQUE ("store_id", "phone_number"),
  CONSTRAINT "whatsapp_bot_numbers_id_store_unique"
    UNIQUE ("id", "store_id"),
  CONSTRAINT "whatsapp_bot_numbers_status_check"
    CHECK ("status" IN ('inactive', 'active', 'disconnected', 'error')),
  CONSTRAINT "whatsapp_bot_numbers_phone_shape_check"
    CHECK ("phone_number" ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_bot_numbers_provider_number_unique"
  ON "whatsapp_bot_numbers" ("provider", "provider_number_id")
  WHERE "provider_number_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "whatsapp_bot_numbers_store_status_idx"
  ON "whatsapp_bot_numbers" ("store_id", "status");

CREATE TABLE IF NOT EXISTS "whatsapp_bot_sessions" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "number_id" integer NOT NULL,
  "provider" text DEFAULT 'evolution' NOT NULL,
  "provider_session_id" text NOT NULL,
  "status" text DEFAULT 'disconnected' NOT NULL,
  "qr_code_expires_at" timestamp with time zone,
  "connected_at" timestamp with time zone,
  "disconnected_at" timestamp with time zone,
  "last_heartbeat_at" timestamp with time zone,
  "last_error_code" text,
  "last_error_message" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "whatsapp_bot_sessions_number_store_fk"
    FOREIGN KEY ("number_id", "store_id")
    REFERENCES "whatsapp_bot_numbers"("id", "store_id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_sessions_status_check"
    CHECK ("status" IN ('disconnected', 'pending_qr', 'connecting', 'connected', 'paused', 'error')),
  CONSTRAINT "whatsapp_bot_sessions_provider_instance_unique"
    UNIQUE ("provider", "provider_session_id"),
  CONSTRAINT "whatsapp_bot_sessions_id_store_unique"
    UNIQUE ("id", "store_id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_bot_sessions_one_connected_per_store_idx"
  ON "whatsapp_bot_sessions" ("store_id")
  WHERE "status" IN ('pending_qr', 'connecting', 'connected');

CREATE INDEX IF NOT EXISTS "whatsapp_bot_sessions_store_status_idx"
  ON "whatsapp_bot_sessions" ("store_id", "status");

CREATE INDEX IF NOT EXISTS "whatsapp_bot_sessions_number_status_idx"
  ON "whatsapp_bot_sessions" ("store_id", "number_id", "status");

CREATE TABLE IF NOT EXISTS "whatsapp_bot_assistant_configs" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "number_id" integer,
  "assistant_name" text DEFAULT 'Assistente virtual' NOT NULL,
  "greeting_message" text DEFAULT 'Oi! Eu sou o assistente virtual da loja. Posso te ajudar com o cardapio, horarios, pagamentos e pedidos.' NOT NULL,
  "fallback_message" text DEFAULT 'Nao tenho certeza sobre isso. Posso te enviar o cardapio ou chamar uma pessoa da equipe para ajudar.' NOT NULL,
  "tone" text DEFAULT 'friendly' NOT NULL,
  "response_length" text DEFAULT 'medium' NOT NULL,
  "emoji_usage" text DEFAULT 'light' NOT NULL,
  "additional_instructions" text,
  "status" text DEFAULT 'draft' NOT NULL,
  "test_mode_enabled" boolean DEFAULT true NOT NULL,
  "updated_by_user_id" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "whatsapp_bot_assistant_configs_number_store_fk"
    FOREIGN KEY ("number_id", "store_id")
    REFERENCES "whatsapp_bot_numbers"("id", "store_id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_assistant_configs_store_unique" UNIQUE ("store_id"),
  CONSTRAINT "whatsapp_bot_assistant_configs_id_store_unique" UNIQUE ("id", "store_id"),
  CONSTRAINT "whatsapp_bot_assistant_configs_tone_check"
    CHECK ("tone" IN ('friendly', 'professional', 'casual', 'direct')),
  CONSTRAINT "whatsapp_bot_assistant_configs_response_length_check"
    CHECK ("response_length" IN ('short', 'medium', 'detailed')),
  CONSTRAINT "whatsapp_bot_assistant_configs_emoji_usage_check"
    CHECK ("emoji_usage" IN ('none', 'light', 'expressive')),
  CONSTRAINT "whatsapp_bot_assistant_configs_status_check"
    CHECK ("status" IN ('draft', 'active', 'paused')),
  CONSTRAINT "whatsapp_bot_assistant_configs_text_length_check"
    CHECK (
      char_length("assistant_name") BETWEEN 2 AND 80
      AND char_length("greeting_message") BETWEEN 10 AND 1000
      AND char_length("fallback_message") BETWEEN 10 AND 1000
      AND ("additional_instructions" IS NULL OR char_length("additional_instructions") <= 3000)
    )
);

CREATE INDEX IF NOT EXISTS "whatsapp_bot_assistant_configs_store_status_idx"
  ON "whatsapp_bot_assistant_configs" ("store_id", "status");

CREATE TABLE IF NOT EXISTS "whatsapp_bot_contacts" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "phone_number" text NOT NULL,
  "display_name" text,
  "source" text DEFAULT 'whatsapp' NOT NULL,
  "first_contact_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "last_contact_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "promotional_opt_out_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "whatsapp_bot_contacts_store_phone_unique" UNIQUE ("store_id", "phone_number"),
  CONSTRAINT "whatsapp_bot_contacts_id_store_unique" UNIQUE ("id", "store_id"),
  CONSTRAINT "whatsapp_bot_contacts_source_check"
    CHECK ("source" IN ('whatsapp', 'manual', 'imported', 'digital_menu')),
  CONSTRAINT "whatsapp_bot_contacts_phone_shape_check"
    CHECK ("phone_number" ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE INDEX IF NOT EXISTS "whatsapp_bot_contacts_store_last_contact_idx"
  ON "whatsapp_bot_contacts" ("store_id", "last_contact_at");

CREATE TABLE IF NOT EXISTS "whatsapp_bot_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "contact_id" integer NOT NULL,
  "number_id" integer,
  "session_id" integer,
  "mode" text DEFAULT 'automatic' NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "context_summary" text,
  "human_paused_at" timestamp with time zone,
  "returned_to_bot_at" timestamp with time zone,
  "last_message_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "whatsapp_bot_conversations_id_store_unique" UNIQUE ("id", "store_id"),
  CONSTRAINT "whatsapp_bot_conversations_contact_store_fk"
    FOREIGN KEY ("contact_id", "store_id")
    REFERENCES "whatsapp_bot_contacts"("id", "store_id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_conversations_number_store_fk"
    FOREIGN KEY ("number_id", "store_id")
    REFERENCES "whatsapp_bot_numbers"("id", "store_id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_conversations_session_store_fk"
    FOREIGN KEY ("session_id", "store_id")
    REFERENCES "whatsapp_bot_sessions"("id", "store_id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_conversations_mode_check"
    CHECK ("mode" IN ('automatic', 'human')),
  CONSTRAINT "whatsapp_bot_conversations_status_check"
    CHECK ("status" IN ('open', 'pending_human', 'closed', 'blocked')),
  CONSTRAINT "whatsapp_bot_conversations_human_shape_check"
    CHECK (
      ("mode" = 'human' AND "human_paused_at" IS NOT NULL)
      OR "mode" = 'automatic'
    )
);

CREATE INDEX IF NOT EXISTS "whatsapp_bot_conversations_store_status_idx"
  ON "whatsapp_bot_conversations" ("store_id", "status", "last_message_at");

CREATE INDEX IF NOT EXISTS "whatsapp_bot_conversations_contact_idx"
  ON "whatsapp_bot_conversations" ("store_id", "contact_id", "created_at");

CREATE INDEX IF NOT EXISTS "whatsapp_bot_conversations_number_status_idx"
  ON "whatsapp_bot_conversations" ("store_id", "number_id", "status");

CREATE TABLE IF NOT EXISTS "whatsapp_bot_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "conversation_id" uuid NOT NULL,
  "contact_id" integer,
  "number_id" integer,
  "session_id" integer,
  "provider_message_id" text,
  "direction" text NOT NULL,
  "sender_type" text NOT NULL,
  "message_type" text DEFAULT 'text' NOT NULL,
  "body" text,
  "transcription" text,
  "status" text DEFAULT 'received' NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "whatsapp_bot_messages_conversation_store_fk"
    FOREIGN KEY ("conversation_id", "store_id")
    REFERENCES "whatsapp_bot_conversations"("id", "store_id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_messages_contact_store_fk"
    FOREIGN KEY ("contact_id", "store_id")
    REFERENCES "whatsapp_bot_contacts"("id", "store_id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_messages_number_store_fk"
    FOREIGN KEY ("number_id", "store_id")
    REFERENCES "whatsapp_bot_numbers"("id", "store_id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_messages_session_store_fk"
    FOREIGN KEY ("session_id", "store_id")
    REFERENCES "whatsapp_bot_sessions"("id", "store_id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_messages_direction_check"
    CHECK ("direction" IN ('inbound', 'outbound', 'internal')),
  CONSTRAINT "whatsapp_bot_messages_sender_type_check"
    CHECK ("sender_type" IN ('customer', 'bot', 'human', 'system')),
  CONSTRAINT "whatsapp_bot_messages_message_type_check"
    CHECK ("message_type" IN ('text', 'audio', 'image', 'document', 'unknown')),
  CONSTRAINT "whatsapp_bot_messages_status_check"
    CHECK ("status" IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  CONSTRAINT "whatsapp_bot_messages_body_or_media_check"
    CHECK ("body" IS NOT NULL OR "transcription" IS NOT NULL OR "message_type" <> 'text')
);

CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_bot_messages_provider_message_unique"
  ON "whatsapp_bot_messages" ("store_id", "provider_message_id")
  WHERE "provider_message_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "whatsapp_bot_messages_conversation_time_idx"
  ON "whatsapp_bot_messages" ("store_id", "conversation_id", "occurred_at");

CREATE INDEX IF NOT EXISTS "whatsapp_bot_messages_status_idx"
  ON "whatsapp_bot_messages" ("store_id", "status", "created_at");

CREATE TABLE IF NOT EXISTS "whatsapp_bot_transactional_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "conversation_id" uuid,
  "contact_id" integer,
  "number_id" integer,
  "session_id" integer,
  "order_id" integer,
  "channel" text DEFAULT 'whatsapp' NOT NULL,
  "event_type" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "idempotency_key" text NOT NULL,
  "recipient_phone" text NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "last_error" text,
  "processed_at" timestamp with time zone,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "whatsapp_bot_transactional_events_store_idempotency_unique"
    UNIQUE ("store_id", "idempotency_key"),
  CONSTRAINT "whatsapp_bot_transactional_events_id_store_unique"
    UNIQUE ("id", "store_id"),
  CONSTRAINT "whatsapp_bot_transactional_events_conversation_store_fk"
    FOREIGN KEY ("conversation_id", "store_id")
    REFERENCES "whatsapp_bot_conversations"("id", "store_id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_transactional_events_contact_store_fk"
    FOREIGN KEY ("contact_id", "store_id")
    REFERENCES "whatsapp_bot_contacts"("id", "store_id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_transactional_events_number_store_fk"
    FOREIGN KEY ("number_id", "store_id")
    REFERENCES "whatsapp_bot_numbers"("id", "store_id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_transactional_events_session_store_fk"
    FOREIGN KEY ("session_id", "store_id")
    REFERENCES "whatsapp_bot_sessions"("id", "store_id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_transactional_events_order_store_fk"
    FOREIGN KEY ("order_id", "store_id")
    REFERENCES "orders"("id", "store_id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_transactional_events_channel_check"
    CHECK ("channel" IN ('whatsapp')),
  CONSTRAINT "whatsapp_bot_transactional_events_event_type_check"
    CHECK ("event_type" IN ('order_status', 'cashback', 'loyalty', 'manual', 'fallback')),
  CONSTRAINT "whatsapp_bot_transactional_events_status_check"
    CHECK ("status" IN ('queued', 'processing', 'sent', 'failed', 'discarded')),
  CONSTRAINT "whatsapp_bot_transactional_events_attempts_check"
    CHECK ("attempts" >= 0 AND "max_attempts" BETWEEN 1 AND 10 AND "attempts" <= "max_attempts"),
  CONSTRAINT "whatsapp_bot_transactional_events_recipient_phone_shape_check"
    CHECK ("recipient_phone" ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE INDEX IF NOT EXISTS "whatsapp_bot_transactional_events_store_status_idx"
  ON "whatsapp_bot_transactional_events" ("store_id", "status", "next_attempt_at");

CREATE INDEX IF NOT EXISTS "whatsapp_bot_transactional_events_conversation_idx"
  ON "whatsapp_bot_transactional_events" ("store_id", "conversation_id", "created_at");

CREATE INDEX IF NOT EXISTS "whatsapp_bot_transactional_events_order_idx"
  ON "whatsapp_bot_transactional_events" ("store_id", "order_id", "created_at");

CREATE TABLE IF NOT EXISTS "whatsapp_bot_delivery_attempts" (
  "id" serial PRIMARY KEY,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE cascade ON UPDATE no action,
  "event_id" uuid NOT NULL,
  "number_id" integer,
  "session_id" integer,
  "attempt_number" integer NOT NULL,
  "status" text NOT NULL,
  "provider_message_id" text,
  "error_code" text,
  "error_message" text,
  "attempted_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "next_attempt_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "whatsapp_bot_delivery_attempts_event_store_fk"
    FOREIGN KEY ("event_id", "store_id")
    REFERENCES "whatsapp_bot_transactional_events"("id", "store_id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_delivery_attempts_number_store_fk"
    FOREIGN KEY ("number_id", "store_id")
    REFERENCES "whatsapp_bot_numbers"("id", "store_id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_delivery_attempts_session_store_fk"
    FOREIGN KEY ("session_id", "store_id")
    REFERENCES "whatsapp_bot_sessions"("id", "store_id")
    ON DELETE no action ON UPDATE no action,
  CONSTRAINT "whatsapp_bot_delivery_attempts_event_attempt_unique"
    UNIQUE ("event_id", "attempt_number"),
  CONSTRAINT "whatsapp_bot_delivery_attempts_status_check"
    CHECK ("status" IN ('attempted', 'succeeded', 'failed', 'skipped')),
  CONSTRAINT "whatsapp_bot_delivery_attempts_attempt_number_check"
    CHECK ("attempt_number" > 0)
);

CREATE INDEX IF NOT EXISTS "whatsapp_bot_delivery_attempts_store_status_idx"
  ON "whatsapp_bot_delivery_attempts" ("store_id", "status", "attempted_at");

CREATE INDEX IF NOT EXISTS "whatsapp_bot_delivery_attempts_event_idx"
  ON "whatsapp_bot_delivery_attempts" ("event_id", "attempted_at");

ALTER TABLE "whatsapp_bot_numbers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_bot_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_bot_assistant_configs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_bot_contacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_bot_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_bot_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_bot_transactional_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_bot_delivery_attempts" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "whatsapp_bot_numbers" FORCE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_bot_sessions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_bot_assistant_configs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_bot_contacts" FORCE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_bot_conversations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_bot_messages" FORCE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_bot_transactional_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "whatsapp_bot_delivery_attempts" FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "whatsapp_bot_numbers" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "whatsapp_bot_sessions" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "whatsapp_bot_assistant_configs" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "whatsapp_bot_contacts" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "whatsapp_bot_conversations" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "whatsapp_bot_messages" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "whatsapp_bot_transactional_events" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE "whatsapp_bot_delivery_attempts" FROM PUBLIC, anon, authenticated;

REVOKE ALL ON SEQUENCE "whatsapp_bot_numbers_id_seq" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "whatsapp_bot_sessions_id_seq" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "whatsapp_bot_assistant_configs_id_seq" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "whatsapp_bot_contacts_id_seq" FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE "whatsapp_bot_delivery_attempts_id_seq" FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "whatsapp_bot_numbers" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "whatsapp_bot_sessions" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "whatsapp_bot_assistant_configs" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "whatsapp_bot_contacts" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "whatsapp_bot_conversations" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "whatsapp_bot_messages" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "whatsapp_bot_transactional_events" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "whatsapp_bot_delivery_attempts" TO service_role;

GRANT USAGE, SELECT ON SEQUENCE "whatsapp_bot_numbers_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "whatsapp_bot_sessions_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "whatsapp_bot_assistant_configs_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "whatsapp_bot_contacts_id_seq" TO service_role;
GRANT USAGE, SELECT ON SEQUENCE "whatsapp_bot_delivery_attempts_id_seq" TO service_role;

COMMENT ON TABLE "whatsapp_bot_numbers" IS
  'WhatsApp numbers connected by each store and provider. Numbers are isolated by store and can later back one or more sessions.';

COMMENT ON TABLE "whatsapp_bot_sessions" IS
  'WhatsApp provider sessions isolated by store. Stores connection state, QR lifecycle and provider metadata.';

COMMENT ON TABLE "whatsapp_bot_assistant_configs" IS
  'Per-store assistant identity, personality, greeting, fallback and test-mode configuration.';

COMMENT ON TABLE "whatsapp_bot_contacts" IS
  'Per-store WhatsApp contacts. The same phone can exist independently in different stores.';

COMMENT ON TABLE "whatsapp_bot_conversations" IS
  'WhatsApp conversations isolated by store, contact and optional session, including automatic or human mode.';

COMMENT ON TABLE "whatsapp_bot_messages" IS
  'Inbound, outbound and internal WhatsApp bot messages with provider ids, status and minimal context.';

COMMENT ON TABLE "whatsapp_bot_transactional_events" IS
  'Idempotent outbound WhatsApp transactional events for order status, benefits and operational fallbacks.';

COMMENT ON TABLE "whatsapp_bot_delivery_attempts" IS
  'Attempt history for WhatsApp bot transactional events, preserving retry diagnostics per store.';
