CREATE OR REPLACE FUNCTION public.kan133_configure_watchdog(p_token text, p_chat_id bigint,
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
    telegram_chat_id = p_chat_id, anon_key = p_anon_key, edge_url = p_edge_url, enabled = true
    WHERE singleton;
END;
$fn$;


CREATE OR REPLACE FUNCTION public.kan133_watchdog_context() RETURNS jsonb
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
  UPDATE infra_qa.watchdog_state SET last_claim_at = server_now WHERE singleton;
  IF st.pending_event_id IS NOT NULL THEN
    IF server_now < st.pending_since + interval '3 minutes' THEN
      RETURN jsonb_build_object('send', false);
    END IF;
    UPDATE infra_qa.watchdog_state SET pending_event_id = NULL, pending_signal = NULL,
      pending_since = NULL, last_error_code = 'delivery_unknown',
      next_attempt_at = greatest(next_attempt_at, server_now + interval '60 seconds')
      WHERE singleton;
    SELECT * INTO STRICT st FROM infra_qa.watchdog_state WHERE singleton;
  END IF;
  SELECT * INTO STRICT hb FROM public.kan133_heartbeat WHERE singleton;
  signal := infra_qa.classify(hb.observed_at, hb.captured_at,
    hb.offsite_verified_at, hb.backup_failed, server_now);
  IF signal IS DISTINCT FROM st.observed_signal THEN
    UPDATE infra_qa.watchdog_state SET observed_signal = signal, attempts = 0 WHERE singleton;
    SELECT * INTO STRICT st FROM infra_qa.watchdog_state WHERE singleton;
  END IF;
  IF signal = st.delivered_signal OR st.attempts >= 3 OR server_now < st.next_attempt_at THEN
    RETURN jsonb_build_object('send', false);
  END IF;
  SELECT decrypted_secret INTO bot_token FROM vault.decrypted_secrets
    WHERE id = cfg.telegram_secret_id AND name = 'kan133_telegram';
  IF bot_token IS NULL OR bot_token !~ '^[0-9]{5,20}:[A-Za-z0-9_-]{20,100}$' THEN
    UPDATE infra_qa.watchdog_state SET attempts = 3, last_error_code = 'token_missing'
      WHERE singleton;
    RETURN jsonb_build_object('send', false);
  END IF;
  event_id := gen_random_uuid();
  UPDATE infra_qa.watchdog_state SET pending_event_id = event_id,
    pending_signal = signal, pending_since = server_now, attempts = attempts + 1
    WHERE singleton;
  RETURN jsonb_build_object('send', true, 'token', bot_token,
    'chat_id', cfg.telegram_chat_id::text, 'event_id', event_id,
    'text', 'KAN-133 QA: ' || CASE WHEN signal = 'ok/ok' THEN 'RECOVERY' ELSE signal END);
END;
$fn$;


CREATE OR REPLACE FUNCTION public.kan133_watchdog_result(p_event_id uuid, p_ok boolean,
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
    pending_event_id = NULL, pending_signal = NULL, pending_since = NULL
    WHERE singleton;
  RETURN true;
END;
$fn$;


CREATE OR REPLACE FUNCTION infra_qa.watchdog_tick() RETURNS void
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
        edge_request_id = NULL, edge_request_at = NULL WHERE singleton;
    ELSE
      UPDATE infra_qa.watchdog_state SET last_edge_status = resp.status_code,
        last_edge_error = CASE WHEN resp.status_code IN (200, 204)
          AND NOT coalesce(resp.timed_out, false) AND NOT resp.has_error THEN NULL
          ELSE 'edge_http_failure' END, edge_request_id = NULL, edge_request_at = NULL
          WHERE singleton;
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
      edge_request_at = server_now, last_enqueue_at = server_now WHERE singleton;
  EXCEPTION WHEN OTHERS THEN
    UPDATE infra_qa.watchdog_state SET last_edge_error = 'edge_enqueue_failed',
      last_enqueue_at = server_now WHERE singleton;
  END;
END;
$fn$;
