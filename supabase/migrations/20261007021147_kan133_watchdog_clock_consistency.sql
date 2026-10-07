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
  server_now := clock_timestamp();
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
