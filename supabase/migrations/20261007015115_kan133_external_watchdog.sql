-- KAN-133: Main owns CLI migration generation, deployment and provisioning.
-- Requires infra_qa.principal/is_uploader() from the storage migration.
-- No generated UUIDs or credentials. This template is not executed locally.
-- pg_net contains ONLY public anon JWT + fixed Edge URL, never Telegram token.
-- Edge verify_jwt=true; NEW admin client from default Edge environment, never
-- forward incoming Authorization into the admin RPC client. Ignore ALL caller
-- body/query overrides. Return generic HTTP status, NEVER context/token/chat,
-- RPC errors, Telegram response/URL. Never log these or raw fetch exceptions.
-- infra_qa/net/vault must stay unexposed. Audit LOGIN roles and definer RPCs.
-- https://supabase.com/docs/guides/troubleshooting/database-roles-can-read-request-headers-queued-by-pg_net-ad6357
BEGIN;
DO $prerequisites$
BEGIN
  IF to_regclass('infra_qa.principal') IS NULL
     OR to_regprocedure('infra_qa.is_uploader()') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'supabase_vault') THEN
    RAISE EXCEPTION 'KAN133_MISSING_PREREQUISITES';
  END IF;
END;
$prerequisites$;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Preserve authenticated USAGE/is_uploader EXECUTE from the first migration.
CREATE TABLE infra_qa.watchdog_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  telegram_secret_id uuid,
  telegram_chat_id bigint CHECK (telegram_chat_id <> 0),
  edge_url text,
  anon_key text,
  enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE infra_qa.watchdog_config ENABLE ROW LEVEL SECURITY;
INSERT INTO infra_qa.watchdog_config DEFAULT VALUES;

CREATE TABLE public.kan133_heartbeat (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  observed_at timestamptz,
  captured_at timestamptz,
  offsite_verified_at timestamptz,
  backup_failed boolean NOT NULL DEFAULT false,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metrics) = 'object'),
  CHECK ((captured_at IS NULL) = (offsite_verified_at IS NULL)),
  CHECK (captured_at IS NULL OR (isfinite(captured_at) AND isfinite(offsite_verified_at)
    AND captured_at <= offsite_verified_at))
);
ALTER TABLE public.kan133_heartbeat ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kan133_heartbeat FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO public.kan133_heartbeat DEFAULT VALUES;
CREATE POLICY kan133_heartbeat_read ON public.kan133_heartbeat
  FOR SELECT TO authenticated USING ((SELECT infra_qa.is_uploader()));
CREATE POLICY kan133_heartbeat_update ON public.kan133_heartbeat
  FOR UPDATE TO authenticated USING ((SELECT infra_qa.is_uploader()))
  WITH CHECK ((SELECT infra_qa.is_uploader()));
GRANT SELECT ON public.kan133_heartbeat TO authenticated;
GRANT UPDATE (captured_at, offsite_verified_at, backup_failed, metrics)
  ON public.kan133_heartbeat TO authenticated;

CREATE FUNCTION infra_qa.stamp_heartbeat() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  server_now timestamptz := clock_timestamp();
  metric record;
BEGIN
  IF NEW.singleton IS DISTINCT FROM OLD.singleton
     OR (NEW.captured_at IS NOT NULL AND
       (NOT isfinite(NEW.captured_at) OR NOT isfinite(NEW.offsite_verified_at)
        OR NEW.captured_at > NEW.offsite_verified_at OR NEW.offsite_verified_at > server_now))
     OR (OLD.captured_at IS NOT NULL AND
       (NEW.captured_at IS NULL OR NEW.offsite_verified_at IS NULL
        OR NEW.captured_at < OLD.captured_at OR NEW.offsite_verified_at < OLD.offsite_verified_at)) THEN
    RAISE EXCEPTION 'KAN133_INVALID_HEARTBEAT';
  END IF;
  IF NEW.metrics IS NULL OR jsonb_typeof(NEW.metrics) <> 'object'
     OR octet_length(NEW.metrics::text) > 1024 THEN
    RAISE EXCEPTION 'KAN133_INVALID_METRICS';
  END IF;
  FOR metric IN SELECT key, value FROM jsonb_each(NEW.metrics) LOOP
    IF metric.key NOT IN ('cpu_percent', 'ram_percent', 'disk_percent',
        'container_restarts', 'container_oom') OR jsonb_typeof(metric.value) <> 'number' THEN
      RAISE EXCEPTION 'KAN133_INVALID_METRICS';
    END IF;
    IF metric.value::text::numeric < 0
       OR (metric.key IN ('cpu_percent', 'ram_percent', 'disk_percent')
         AND metric.value::text::numeric > 100)
       OR (metric.key IN ('container_restarts', 'container_oom')
         AND (metric.value::text::numeric > 2147483647
           OR metric.value::text::numeric <> trunc(metric.value::text::numeric))) THEN
      RAISE EXCEPTION 'KAN133_INVALID_METRICS';
    END IF;
  END LOOP;
  NEW.observed_at := server_now;
  RETURN NEW;
END;
$fn$;
CREATE TRIGGER kan133_server_heartbeat BEFORE UPDATE ON public.kan133_heartbeat
  FOR EACH ROW EXECUTE FUNCTION infra_qa.stamp_heartbeat();

CREATE TABLE infra_qa.watchdog_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  observed_signal text NOT NULL DEFAULT 'unknown',
  delivered_signal text NOT NULL DEFAULT 'ok/ok',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_claim_at timestamptz,
  pending_event_id uuid,
  pending_signal text,
  pending_since timestamptz,
  last_result_event_id uuid,
  last_delivered_at timestamptz,
  last_message_id bigint,
  last_error_code text CHECK (last_error_code IN ('http_error', 'rate_limited',
    'timeout', 'network_error', 'invalid_response', 'delivery_unknown', 'token_missing')),
  last_enqueue_at timestamptz,
  edge_request_id bigint,
  edge_request_at timestamptz,
  last_edge_status integer,
  last_edge_error text CHECK (last_edge_error IN ('edge_http_failure',
    'edge_response_missing', 'edge_enqueue_failed')),
  CHECK ((pending_event_id IS NULL) = (pending_signal IS NULL)),
  CHECK ((pending_event_id IS NULL) = (pending_since IS NULL)),
  CHECK ((edge_request_id IS NULL) = (edge_request_at IS NULL))
);
ALTER TABLE infra_qa.watchdog_state ENABLE ROW LEVEL SECURITY;
INSERT INTO infra_qa.watchdog_state DEFAULT VALUES;

-- Admin Node REST JSON parameters: p_token,p_chat_id,p_anon_key,p_edge_url.
-- p_anon_key must be PUBLIC legacy anon JWT for verify_jwt=true, NOT user JWT,
-- service_role JWT, sb_secret or publishable key. Decode catches accidental
-- privileged keys; Edge gateway verifies signature. Drop RPC after provision.
CREATE FUNCTION public.kan133_configure_watchdog(p_token text, p_chat_id bigint,
  p_anon_key text, p_edge_url text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  secret_id uuid;
  jwt_payload text;
  jwt_claims jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(133, 1);
  IF p_token IS NULL OR p_token !~ '^[0-9]{5,20}:[A-Za-z0-9_-]{20,100}$'
     OR p_chat_id IS NULL OR p_chat_id = 0
     OR p_anon_key IS NULL OR length(p_anon_key) > 4096
     OR p_anon_key !~ '^[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+$'
     OR p_edge_url IS NULL
     OR p_edge_url !~ '^https://[a-z0-9]{20}[.]supabase[.]co/functions/v1/kan133-watchdog$' THEN
    RAISE EXCEPTION 'KAN133_INVALID_CONFIG';
  END IF;
  BEGIN
    jwt_payload := translate(split_part(p_anon_key, '.', 2), '-_', '+/');
    jwt_claims := convert_from(decode(jwt_payload || repeat('=',
      (4 - length(jwt_payload) % 4) % 4), 'base64'), 'UTF8')::jsonb;
    IF jwt_claims ->> 'role' IS DISTINCT FROM 'anon'
       OR jwt_claims ->> 'ref' IS DISTINCT FROM split_part(split_part(p_edge_url, '/', 3), '.', 1) THEN
      RAISE EXCEPTION 'KAN133_INVALID_PUBLIC_KEY';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'KAN133_INVALID_PUBLIC_KEY';
  END;
  IF EXISTS (SELECT 1 FROM infra_qa.watchdog_config WHERE telegram_secret_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'kan133_telegram') THEN
    RAISE EXCEPTION 'KAN133_CONFIG_ALREADY_EXISTS';
  END IF;
  BEGIN
    secret_id := vault.create_secret(p_token, 'kan133_telegram', 'KAN-133 Edge-only Telegram');
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'KAN133_CONFIG_FAILED';
  END;
  UPDATE infra_qa.watchdog_config SET telegram_secret_id = secret_id,
    telegram_chat_id = p_chat_id, anon_key = p_anon_key, edge_url = p_edge_url, enabled = true;
END;
$fn$;

CREATE FUNCTION infra_qa.classify(heartbeat_at timestamptz, capture_at timestamptz,
  verified_at timestamptz, backup_failed boolean, server_now timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $fn$
  SELECT
    CASE WHEN heartbeat_at IS NULL OR NOT isfinite(heartbeat_at)
      OR heartbeat_at > server_now OR server_now - heartbeat_at >= interval '5 minutes'
      THEN 'heartbeat_critical' ELSE 'ok' END || '/' ||
    CASE WHEN backup_failed IS DISTINCT FROM false OR capture_at IS NULL OR verified_at IS NULL
      OR NOT isfinite(capture_at) OR NOT isfinite(verified_at)
      OR capture_at > verified_at OR verified_at > server_now
      OR server_now - capture_at >= interval '24 hours' THEN 'backup_critical'
      WHEN server_now - capture_at >= interval '18 hours' THEN 'backup_warning'
      ELSE 'ok' END;
$fn$;

-- Edge admin only. Atomic claim, sliding-window <=1/min, no caller inputs.
-- Token returned ONLY with event needing delivery. New UUID per attempt fences
-- late results from an expired lease. Edge fetch timeout must be <3min.
CREATE FUNCTION public.kan133_watchdog_context() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  cfg infra_qa.watchdog_config%ROWTYPE;
  st infra_qa.watchdog_state%ROWTYPE;
  hb public.kan133_heartbeat%ROWTYPE;
  server_now timestamptz := clock_timestamp();
  signal text;
  event_id uuid;
  bot_token text;
BEGIN
  IF NOT pg_catalog.pg_try_advisory_xact_lock(133, 1) THEN
    RETURN jsonb_build_object('send', false);
  END IF;
  SELECT * INTO STRICT cfg FROM infra_qa.watchdog_config WHERE singleton;
  IF NOT cfg.enabled THEN RETURN jsonb_build_object('send', false); END IF;
  SELECT * INTO STRICT st FROM infra_qa.watchdog_state WHERE singleton FOR UPDATE;
  IF st.last_claim_at IS NOT NULL AND server_now < st.last_claim_at + interval '60 seconds' THEN
    RETURN jsonb_build_object('send', false);
  END IF;
  UPDATE infra_qa.watchdog_state SET last_claim_at = server_now;
  IF st.pending_event_id IS NOT NULL THEN
    IF server_now < st.pending_since + interval '3 minutes' THEN
      RETURN jsonb_build_object('send', false);
    END IF;
    UPDATE infra_qa.watchdog_state SET pending_event_id = NULL, pending_signal = NULL,
      pending_since = NULL, last_error_code = 'delivery_unknown',
      next_attempt_at = greatest(next_attempt_at, server_now + interval '60 seconds');
    SELECT * INTO STRICT st FROM infra_qa.watchdog_state WHERE singleton;
  END IF;
  SELECT * INTO STRICT hb FROM public.kan133_heartbeat WHERE singleton;
  signal := infra_qa.classify(hb.observed_at, hb.captured_at,
    hb.offsite_verified_at, hb.backup_failed, server_now);
  IF signal IS DISTINCT FROM st.observed_signal THEN
    UPDATE infra_qa.watchdog_state SET observed_signal = signal, attempts = 0;
    SELECT * INTO STRICT st FROM infra_qa.watchdog_state WHERE singleton;
  END IF;
  IF signal = st.delivered_signal OR st.attempts >= 3 OR server_now < st.next_attempt_at THEN
    RETURN jsonb_build_object('send', false);
  END IF;
  SELECT decrypted_secret INTO bot_token FROM vault.decrypted_secrets
    WHERE id = cfg.telegram_secret_id AND name = 'kan133_telegram';
  IF bot_token IS NULL OR bot_token !~ '^[0-9]{5,20}:[A-Za-z0-9_-]{20,100}$' THEN
    UPDATE infra_qa.watchdog_state SET attempts = 3, last_error_code = 'token_missing';
    RETURN jsonb_build_object('send', false);
  END IF;
  event_id := gen_random_uuid();
  UPDATE infra_qa.watchdog_state SET pending_event_id = event_id,
    pending_signal = signal, pending_since = server_now, attempts = attempts + 1;
  RETURN jsonb_build_object('send', true, 'token', bot_token,
    'chat_id', cfg.telegram_chat_id::text, 'event_id', event_id,
    'text', 'KAN-133 QA: ' || CASE WHEN signal = 'ok/ok' THEN 'RECOVERY' ELSE signal END);
END;
$fn$;

-- Edge calls after HTTP200 + Telegram ok=true + matching chat + positive
-- message_id. Failure: null message_id + allowlisted error. rate_limited:<secs>
-- honors retry_after (0..999999); no raw descriptions/exceptions accepted.
-- true = accepted; false = stale/duplicate. No delivery from pg_net response.
CREATE FUNCTION public.kan133_watchdog_result(p_event_id uuid, p_ok boolean,
  p_message_id bigint, p_error_code text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  st infra_qa.watchdog_state%ROWTYPE;
  server_now timestamptz;
  retry_seconds integer;
  safe_error text;
BEGIN
  IF p_event_id IS NULL OR p_ok IS NULL
     OR (p_ok AND (p_message_id IS NULL OR p_message_id <= 0 OR p_error_code IS NOT NULL))
     OR (NOT p_ok AND (p_message_id IS NOT NULL OR p_error_code IS NULL
       OR (p_error_code NOT IN ('http_error', 'rate_limited', 'timeout', 'network_error',
         'invalid_response', 'delivery_unknown') AND p_error_code !~ '^rate_limited:[0-9]{1,6}$'))) THEN
    RAISE EXCEPTION 'KAN133_INVALID_RESULT';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(133, 1);
  server_now := clock_timestamp();
  SELECT * INTO STRICT st FROM infra_qa.watchdog_state WHERE singleton FOR UPDATE;
  IF st.pending_event_id IS DISTINCT FROM p_event_id
     OR server_now >= st.pending_since + interval '3 minutes' THEN RETURN false; END IF;
  retry_seconds := CASE WHEN st.attempts >= 2 THEN 300 ELSE 60 END;
  safe_error := p_error_code;
  IF NOT p_ok AND p_error_code LIKE 'rate_limited:%' THEN
    retry_seconds := greatest(retry_seconds, split_part(p_error_code, ':', 2)::integer);
    safe_error := 'rate_limited';
  ELSIF NOT p_ok AND p_error_code = 'rate_limited' THEN
    retry_seconds := greatest(retry_seconds, 3600);
  END IF;
  UPDATE infra_qa.watchdog_state SET
    delivered_signal = CASE WHEN p_ok THEN st.pending_signal ELSE delivered_signal END,
    last_delivered_at = CASE WHEN p_ok THEN server_now ELSE last_delivered_at END,
    last_message_id = CASE WHEN p_ok THEN p_message_id ELSE last_message_id END,
    last_result_event_id = p_event_id,
    last_error_code = CASE WHEN p_ok THEN NULL ELSE safe_error END,
    next_attempt_at = server_now + make_interval(secs => retry_seconds),
    pending_event_id = NULL, pending_signal = NULL, pending_since = NULL;
  RETURN true;
END;
$fn$;

-- Cron transport never reads Vault. Only result RPC acknowledges Telegram.
CREATE FUNCTION infra_qa.watchdog_tick() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $fn$
DECLARE
  cfg infra_qa.watchdog_config%ROWTYPE;
  st infra_qa.watchdog_state%ROWTYPE;
  resp record;
  server_now timestamptz := clock_timestamp();
  request_id bigint;
BEGIN
  IF NOT pg_catalog.pg_try_advisory_xact_lock(133, 1) THEN RETURN; END IF;
  SELECT * INTO STRICT cfg FROM infra_qa.watchdog_config WHERE singleton;
  IF NOT cfg.enabled THEN RETURN; END IF;
  SELECT * INTO STRICT st FROM infra_qa.watchdog_state WHERE singleton FOR UPDATE;
  IF st.edge_request_id IS NOT NULL THEN
    SELECT status_code, timed_out, error_msg IS NOT NULL AS has_error INTO resp
      FROM net._http_response WHERE id = st.edge_request_id ORDER BY created DESC LIMIT 1;
    IF NOT FOUND THEN
      IF server_now < st.edge_request_at + interval '3 minutes' THEN RETURN; END IF;
      UPDATE infra_qa.watchdog_state SET last_edge_error = 'edge_response_missing',
        edge_request_id = NULL, edge_request_at = NULL;
    ELSE
      UPDATE infra_qa.watchdog_state SET last_edge_status = resp.status_code,
        last_edge_error = CASE WHEN resp.status_code IN (200, 204)
          AND NOT coalesce(resp.timed_out, false) AND NOT resp.has_error THEN NULL
          ELSE 'edge_http_failure' END, edge_request_id = NULL, edge_request_at = NULL;
    END IF;
  END IF;
  IF st.last_enqueue_at IS NOT NULL AND server_now < st.last_enqueue_at + interval '60 seconds' THEN
    RETURN;
  END IF;
  BEGIN
    request_id := net.http_post(url := cfg.edge_url, body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type', 'application/json',
        'Authorization', 'Bearer ' || cfg.anon_key, 'apikey', cfg.anon_key),
      timeout_milliseconds := 15000);
    UPDATE infra_qa.watchdog_state SET edge_request_id = request_id,
      edge_request_at = server_now, last_enqueue_at = server_now;
  EXCEPTION WHEN OTHERS THEN
    UPDATE infra_qa.watchdog_state SET last_edge_error = 'edge_enqueue_failed',
      last_enqueue_at = server_now;
  END;
END;
$fn$;

ALTER FUNCTION infra_qa.stamp_heartbeat() OWNER TO postgres;
ALTER FUNCTION infra_qa.classify(timestamptz, timestamptz, timestamptz, boolean, timestamptz) OWNER TO postgres;
ALTER FUNCTION infra_qa.watchdog_tick() OWNER TO postgres;
ALTER FUNCTION public.kan133_configure_watchdog(text, bigint, text, text) OWNER TO postgres;
ALTER FUNCTION public.kan133_watchdog_context() OWNER TO postgres;
ALTER FUNCTION public.kan133_watchdog_result(uuid, boolean, bigint, text) OWNER TO postgres;
REVOKE ALL ON infra_qa.watchdog_config, infra_qa.watchdog_state
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION infra_qa.stamp_heartbeat(),
  infra_qa.classify(timestamptz, timestamptz, timestamptz, boolean, timestamptz),
  infra_qa.watchdog_tick() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.kan133_configure_watchdog(text, bigint, text, text),
  public.kan133_watchdog_context(), public.kan133_watchdog_result(uuid, boolean, bigint, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kan133_configure_watchdog(text, bigint, text, text),
  public.kan133_watchdog_context(), public.kan133_watchdog_result(uuid, boolean, bigint, text)
  TO service_role;

-- Disabled config prevents HTTP until Main provisions AFTER Edge deployment.
SELECT cron.schedule('kan133-qa-watchdog', '* * * * *', 'SELECT infra_qa.watchdog_tick();');
COMMIT;

-- SQL TEST NOTES: synthetic local DB with mocked Vault/net, no live SQL/secrets.
-- 1. Principal resolved dynamically, no UUID literals. anon/authenticated denied
--    all 3 public RPCs; service_role executes RPCs, no direct private grants.
-- 2. Uploader PATCH /rest/v1/kan133_heartbeat?singleton=eq.true updates ONLY
--    captured_at/offsite_verified_at/backup_failed/metrics. No POST/INSERT/DELETE,
--    observed_at/singleton/private state/config/principal writes. Others zero rows.
-- 3. observed_at refreshes server-side. Reject future/infinity/unpaired/regressing
--    timestamps; reject free text, nesting/unknown/negative/oversized metrics.
--    Keys cpu_percent/ram_percent/disk_percent (0..100), container_restarts/
--    container_oom (integer 0..2147483647); {} valid, size <=1024 bytes.
-- 4. Exact 5min heartbeat/18h capture/24h capture thresholds; invalid/failure
--    critical. Recent verification NEVER refreshes old capture.
-- 5. Configure rejects privileged JWT/key/noncanonical URL. Vault holds bot token,
--    config only UUID. Drop configure RPC after successful one-shot provisioning.
--    SQL/REST/Edge instrumentation must not log provisioning or context bodies.
-- 6. Concurrent context <=1 leased event per sliding 60s. Anonymous Edge calls
--    cannot choose message/chat/token/event/ack. NEVER return context publicly.
-- 7. Success only via matching result UUID, never enqueue/Edge HTTP200. Duplicate/
--    expired/old lease UUID rejected. 3 attempts per observed transition. Successful
--    signal deduplicated; recovery only after a delivered incident. Honor retry_after
--    across transitions. Exhaustion persists visibly until transition/operator action.
-- 8. Lost result after Telegram acceptance can duplicate (at-least-once). New lease
--    UUID fences stale ACK, not external send. Edge timeouts <3min; no detached work.
--    Validate HTTP200/ok=true/chat/message_id; safe errors only, no raw exceptions.
-- 9. Missing pg_net response/HTTP failure recorded separately without response body/
--    raw error_msg. Only public anon key/Edge URL/{} go into queue; no bot token.
--    SQL review assertion: watchdog_tick has NO vault read or Telegram URL.
-- 10. net/vault/infra_qa unexposed; audit LOGIN/ACLs without reading request secrets.
--     Queue is still mutable by DB logins, but this invocation holds no secret and
--     Edge ignores inputs. Public invocation can incur Edge costs despite SQL rate
--     control: Main audits quota/abuse risk; SQL does not rate-limit gateway traffic.
-- Coverage: VPS heartbeat + claimed backup freshness, not object integrity/restore,
-- Supabase self-outage or ability to alert over an unavailable Telegram channel.
