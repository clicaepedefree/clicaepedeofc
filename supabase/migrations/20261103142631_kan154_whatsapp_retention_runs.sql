CREATE TABLE public.whatsapp_retention_runs (
  id uuid PRIMARY KEY,
  correlation_id uuid NOT NULL,
  actor_id text NOT NULL CHECK (actor_id = 'system:whatsapp-retention'),
  job_name text NOT NULL CHECK (job_name = 'whatsapp-transactional-retention'),
  policy_version text NOT NULL CHECK (policy_version = '2026-10-08.v1'),
  policy_snapshot jsonb NOT NULL CHECK (
    policy_snapshot = '{"openConversationDays":90,"closedConversationDays":30,"transactionalEventDays":180,"deliveryAttemptDays":180,"inactiveContactDays":365,"expiredQrCodeMinutes":15}'::jsonb
  ),
  store_ids integer[],
  effective_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'noop', 'failed')),
  counts jsonb,
  error_code text CHECK (error_code = 'prune_failed')
);

CREATE INDEX whatsapp_retention_runs_started_at_idx
  ON public.whatsapp_retention_runs (started_at DESC);
CREATE INDEX whatsapp_retention_runs_correlation_id_idx
  ON public.whatsapp_retention_runs (correlation_id);

CREATE FUNCTION public.guard_whatsapp_retention_run_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  canonical_store_ids integer[];
  count_entry record;
  count_value numeric;
  count_sum bigint := 0;
  count_keys constant text[] := ARRAY[
    'expiredQrSessions', 'deletedDeliveryAttempts', 'deletedTransactionalEvents',
    'deletedMessages', 'deletedConversations', 'deletedContacts'
  ];
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'whatsapp_retention_runs cannot be deleted or truncated'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'running'
      OR NEW.counts IS NOT NULL OR NEW.error_code IS NOT NULL
      OR NEW.finished_at IS NOT NULL THEN
      RAISE EXCEPTION 'retention runs must start running without a result'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.store_ids IS NOT NULL THEN
      SELECT coalesce(array_agg(DISTINCT store_id ORDER BY store_id), ARRAY[]::integer[])
        INTO canonical_store_ids
        FROM unnest(NEW.store_ids) AS scope(store_id)
        WHERE store_id > 0;
      IF NEW.store_ids IS DISTINCT FROM canonical_store_ids THEN
        RAISE EXCEPTION 'store_ids must be a canonical positive sorted unique array'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM 'running'
    OR NEW.status IS NULL OR NEW.status NOT IN ('succeeded', 'noop', 'failed') THEN
    RAISE EXCEPTION 'retention runs can only finalize once'
      USING ERRCODE = '55000';
  END IF;

  IF ROW(NEW.id, NEW.correlation_id, NEW.actor_id, NEW.job_name,
      NEW.policy_version, NEW.policy_snapshot, NEW.store_ids,
      NEW.effective_at, NEW.started_at)
    IS DISTINCT FROM
    ROW(OLD.id, OLD.correlation_id, OLD.actor_id, OLD.job_name,
      OLD.policy_version, OLD.policy_snapshot, OLD.store_ids,
      OLD.effective_at, OLD.started_at) THEN
    RAISE EXCEPTION 'retention run original fields are immutable'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.finished_at IS NULL OR NEW.counts IS NULL
    OR jsonb_typeof(NEW.counts) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'terminal retention runs require finished_at and counts'
      USING ERRCODE = '23514';
  END IF;

  IF NOT (NEW.counts ?& count_keys) OR NEW.counts - count_keys <> '{}'::jsonb THEN
    RAISE EXCEPTION 'retention counts require exactly the permitted keys'
      USING ERRCODE = '23514';
  END IF;

  FOR count_entry IN SELECT key, value FROM jsonb_each(NEW.counts) LOOP
    IF jsonb_typeof(count_entry.value) IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'retention counts must be numeric integers'
        USING ERRCODE = '23514';
    END IF;
    count_value := count_entry.value::text::numeric;
    IF count_value < 0 OR count_value > 2147483647
      OR count_value <> trunc(count_value) THEN
      RAISE EXCEPTION 'retention counts must be nonnegative int32 integers'
        USING ERRCODE = '23514';
    END IF;
    count_sum := count_sum + count_value::bigint;
  END LOOP;

  IF (NEW.status = 'succeeded' AND (count_sum = 0 OR NEW.error_code IS NOT NULL))
    OR (NEW.status = 'noop' AND (count_sum <> 0 OR NEW.error_code IS NOT NULL))
    OR (NEW.status = 'failed' AND (count_sum <> 0 OR NEW.error_code IS DISTINCT FROM 'prune_failed')) THEN
    RAISE EXCEPTION 'retention result does not match terminal status'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_whatsapp_retention_run_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER whatsapp_retention_runs_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.whatsapp_retention_runs
FOR EACH ROW EXECUTE FUNCTION public.guard_whatsapp_retention_run_mutation();

CREATE TRIGGER whatsapp_retention_runs_no_truncate
BEFORE TRUNCATE ON public.whatsapp_retention_runs
FOR EACH STATEMENT EXECUTE FUNCTION public.guard_whatsapp_retention_run_mutation();

ALTER TABLE public.whatsapp_retention_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_retention_runs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_retention_runs
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.whatsapp_retention_runs IS
  'Private durable technical retention audit, with no personal data or store foreign keys. Retained indefinitely pending a separately approved audit retention policy. No automatic deletion.';
COMMENT ON COLUMN public.whatsapp_retention_runs.store_ids IS
  'Technical scope only: NULL means all stores; empty array means none; otherwise positive sorted unique store IDs.';
