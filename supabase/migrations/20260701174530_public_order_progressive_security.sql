-- KAN-4: append-only audit trail for progressive public checkout protection.
CREATE TABLE IF NOT EXISTS public.public_order_security_events (
  id serial PRIMARY KEY,
  store_id integer NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'INVALID_PAYLOAD', 'CAPTCHA_REQUIRED', 'CAPTCHA_PASSED',
    'CAPTCHA_FAILED', 'RATE_LIMITED', 'TEMPORARILY_BLOCKED'
  )),
  ip_hash text,
  device_hash text,
  phone_hash text,
  user_agent_hash text,
  risk_score integer NOT NULL DEFAULT 0 CHECK (risk_score >= 0),
  captcha_status text NOT NULL DEFAULT 'not_required' CHECK (
    captcha_status IN ('not_required', 'required', 'passed', 'failed')
  ),
  retry_after_seconds integer CHECK (retry_after_seconds IS NULL OR retry_after_seconds > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT current_timestamp,
  CONSTRAINT public_order_security_events_ip_hash_check
    CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT public_order_security_events_device_hash_check
    CHECK (device_hash IS NULL OR device_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT public_order_security_events_phone_hash_check
    CHECK (phone_hash IS NULL OR phone_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT public_order_security_events_user_agent_hash_check
    CHECK (user_agent_hash IS NULL OR user_agent_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS public_order_security_events_store_created_idx
  ON public.public_order_security_events (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS public_order_security_events_ip_created_idx
  ON public.public_order_security_events (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS public_order_security_events_device_created_idx
  ON public.public_order_security_events (device_hash, created_at DESC)
  WHERE device_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS public_order_security_events_phone_created_idx
  ON public.public_order_security_events (phone_hash, created_at DESC)
  WHERE phone_hash IS NOT NULL;

ALTER TABLE public.public_order_security_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_order_security_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.public_order_security_events TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.public_order_security_events FROM service_role;
GRANT USAGE, SELECT ON SEQUENCE public.public_order_security_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_public_order_security_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'public_order_security_events is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS public_order_security_events_append_only
  ON public.public_order_security_events;
CREATE TRIGGER public_order_security_events_append_only
  BEFORE UPDATE OR DELETE ON public.public_order_security_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_public_order_security_event_mutation();

REVOKE ALL ON FUNCTION public.prevent_public_order_security_event_mutation() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.public_order_security_events IS
  'Append-only suspicious checkout audit; stores only HMAC identifiers and sanitized metadata.';
