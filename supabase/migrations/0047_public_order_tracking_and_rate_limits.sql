-- KAN-15: public tracking, distributed abuse controls and tenant-safe events.
-- This migration is intentionally idempotent and must be applied by the release process.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS public_tracking_token_hash text,
  ADD COLUMN IF NOT EXISTS public_tracking_expires_at timestamp with time zone;

ALTER TABLE public.public_order_submissions
  ADD COLUMN IF NOT EXISTS tracking_token_hash text,
  ADD COLUMN IF NOT EXISTS tracking_expires_at timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS orders_public_tracking_token_hash_unique
  ON public.orders (public_tracking_token_hash)
  WHERE public_tracking_token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS public_order_submissions_tracking_token_hash_unique
  ON public.public_order_submissions (tracking_token_hash)
  WHERE tracking_token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS public_order_submissions_id_store_id_unique
  ON public.public_order_submissions (id, store_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'public_order_events_submission_store_fk'
      AND conrelid = 'public.public_order_events'::regclass
  ) THEN
    ALTER TABLE public.public_order_events
      ADD CONSTRAINT public_order_events_submission_store_fk
      FOREIGN KEY (public_order_id, store_id)
      REFERENCES public.public_order_submissions (id, store_id)
      ON DELETE CASCADE;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.public_order_rate_limits (
  store_id integer NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  ip_hash text NOT NULL,
  phone_hash text NOT NULL,
  window_seconds integer NOT NULL CHECK (window_seconds > 0),
  bucket_started_at timestamp with time zone NOT NULL,
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  created_at timestamp with time zone NOT NULL DEFAULT current_timestamp,
  updated_at timestamp with time zone NOT NULL DEFAULT current_timestamp,
  CONSTRAINT public_order_rate_limits_pk PRIMARY KEY (
    store_id, ip_hash, phone_hash, window_seconds, bucket_started_at
  ),
  CONSTRAINT public_order_rate_limits_ip_hash_check
    CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT public_order_rate_limits_phone_hash_check
    CHECK (phone_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS public_order_rate_limits_cleanup_idx
  ON public.public_order_rate_limits (bucket_started_at);

ALTER TABLE public.public_order_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_order_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.public_order_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_public_order_rate_limit(
  p_store_id integer,
  p_ip_hash text,
  p_phone_hash text,
  p_window_seconds integer,
  p_window_limit integer,
  p_burst_seconds integer,
  p_burst_limit integer
)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH policy AS (
    SELECT p_window_seconds AS seconds, p_window_limit AS max_count
    UNION ALL
    SELECT p_burst_seconds, p_burst_limit
  ), buckets AS (
    SELECT
      seconds AS window_seconds,
      max_count,
      to_timestamp(floor(extract(epoch FROM clock_timestamp()) / seconds) * seconds)
        AS bucket_started_at
    FROM policy
    WHERE seconds > 0 AND max_count > 0
  ), consumed AS (
    INSERT INTO public.public_order_rate_limits AS limits (
      store_id, ip_hash, phone_hash, window_seconds, bucket_started_at,
      request_count, created_at, updated_at
    )
    SELECT
      p_store_id, p_ip_hash, p_phone_hash, window_seconds, bucket_started_at,
      1, clock_timestamp(), clock_timestamp()
    FROM buckets
    ON CONFLICT (store_id, ip_hash, phone_hash, window_seconds, bucket_started_at)
    DO UPDATE SET
      request_count = limits.request_count + 1,
      updated_at = clock_timestamp()
    RETURNING window_seconds, bucket_started_at, request_count
  ), evaluated AS (
    SELECT
      consumed.request_count <= buckets.max_count AS is_allowed,
      greatest(
        1,
        ceil(extract(epoch FROM (
          consumed.bucket_started_at
          + make_interval(secs => consumed.window_seconds)
          - clock_timestamp()
        )))::integer
      ) AS retry_seconds
    FROM consumed
    JOIN buckets USING (window_seconds, bucket_started_at)
  )
  SELECT
    coalesce(bool_and(is_allowed), false),
    coalesce(max(retry_seconds) FILTER (WHERE NOT is_allowed), 0)
  FROM evaluated;
$$;

REVOKE ALL ON FUNCTION public.consume_public_order_rate_limit(
  integer, text, text, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_public_order_rate_limit(
  integer, text, text, integer, integer, integer, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_public_order_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'public_order_events is append-only'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS public_order_events_append_only
  ON public.public_order_events;
CREATE TRIGGER public_order_events_append_only
  BEFORE UPDATE OR DELETE ON public.public_order_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_public_order_event_mutation();

ALTER TABLE public.public_order_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.public_order_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.public_order_events TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.public_order_events FROM service_role;
GRANT USAGE, SELECT ON SEQUENCE public.public_order_events_id_seq TO service_role;

COMMENT ON COLUMN public.orders.public_tracking_token_hash IS
  'HMAC-SHA-256 do token publico aleatorio; o token em claro nunca e persistido.';
COMMENT ON COLUMN public.public_order_submissions.tracking_token_hash IS
  'HMAC-SHA-256 do token publico aleatorio; o token em claro nunca e persistido.';
COMMENT ON TABLE public.public_order_rate_limits IS
  'Contadores distribuidos por loja + HMAC de IP + HMAC de telefone; nao armazena identificadores crus.';
