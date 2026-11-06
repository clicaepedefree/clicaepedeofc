CREATE TABLE public.digital_menu_attribution_accesses (
  id uuid PRIMARY KEY,
  store_id integer NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  message_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cart_at timestamptz,
  CONSTRAINT digital_menu_attribution_accesses_conversation_store_fk
    FOREIGN KEY (conversation_id, store_id)
    REFERENCES public.whatsapp_bot_conversations(id, store_id) ON DELETE CASCADE,
  CONSTRAINT digital_menu_attribution_accesses_message_check CHECK (
    message_id ~ '^assistant:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  ),
  CONSTRAINT digital_menu_attribution_accesses_cart_check
    CHECK (cart_at IS NULL OR cart_at >= created_at)
);

CREATE INDEX digital_menu_attribution_accesses_store_created_idx
  ON public.digital_menu_attribution_accesses(store_id, created_at);

ALTER TABLE public.digital_menu_attribution_accesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_menu_attribution_accesses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.digital_menu_attribution_accesses
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.digital_menu_attribution_accesses IS
  'Server-only consented CTA events. Logical TTL 30 days; pruned by the existing retention worker. No phone, IP or raw URL payload; technical correlations relate to existing conversations.';

-- Preserve the original audit guard, accepting old six-key writers during rollout.
ALTER TABLE public.whatsapp_retention_runs
  DROP CONSTRAINT whatsapp_retention_runs_policy_version_check,
  DROP CONSTRAINT whatsapp_retention_runs_policy_snapshot_check;

ALTER TABLE public.whatsapp_retention_runs
  ADD CONSTRAINT whatsapp_retention_runs_policy_version_check
    CHECK (policy_version IN ('2026-10-08.v1', '2026-11-04.v2')),
  ADD CONSTRAINT whatsapp_retention_runs_policy_snapshot_check CHECK (
    (policy_version = '2026-10-08.v1' AND policy_snapshot =
      '{"openConversationDays":90,"closedConversationDays":30,"transactionalEventDays":180,"deliveryAttemptDays":180,"inactiveContactDays":365,"expiredQrCodeMinutes":15}'::jsonb)
    OR (policy_version = '2026-11-04.v2' AND policy_snapshot =
      '{"openConversationDays":90,"closedConversationDays":30,"transactionalEventDays":180,"deliveryAttemptDays":180,"inactiveContactDays":365,"expiredQrCodeMinutes":15,"digitalMenuAttributionDays":30}'::jsonb)
  );

CREATE OR REPLACE FUNCTION public.guard_whatsapp_retention_run_mutation()
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
  IF NOT (NEW.counts ?& count_keys)
    OR NEW.counts - count_keys - 'deletedAttributionAccesses' <> '{}'::jsonb
    OR (NEW.policy_version = '2026-11-04.v2' AND NOT (NEW.counts ? 'deletedAttributionAccesses')) THEN
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
