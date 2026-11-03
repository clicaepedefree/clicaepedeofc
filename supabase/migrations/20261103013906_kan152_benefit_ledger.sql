-- KAN152: backend-only benefit accounts, immutable captures/events/allocations,
-- pinned cycles and authoritative, conserved lots. No checkout/redemption API.
BEGIN;

CREATE TABLE public.benefit_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id integer NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  phone text NOT NULL CHECK (phone ~ '^55[1-9][0-9](9[0-9]{8}|[2-5][0-9]{7})$'),
  adjustment_debt numeric(19,2) NOT NULL DEFAULT 0 CHECK (adjustment_debt >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT benefit_account_store_phone UNIQUE (store_id, phone),
  CONSTRAINT benefit_account_scope UNIQUE (id, store_id)
);

CREATE TABLE public.benefit_captures (
  order_id integer PRIMARY KEY,
  store_id integer NOT NULL,
  account_id uuid NOT NULL,
  rule_version integer NOT NULL,
  base_amount numeric(19,2) NOT NULL DEFAULT 0 CHECK (base_amount >= 0),
  cashback_spent numeric(19,2) NOT NULL DEFAULT 0 CHECK (cashback_spent >= 0),
  cashback_enabled boolean NOT NULL,
  loyalty_enabled boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT benefit_capture_scope UNIQUE (order_id, account_id, store_id),
  FOREIGN KEY (order_id, store_id) REFERENCES public.orders(id, store_id),
  FOREIGN KEY (account_id, store_id) REFERENCES public.benefit_accounts(id, store_id),
  FOREIGN KEY (store_id, rule_version) REFERENCES public.store_benefit_program_versions(store_id, version)
);

CREATE TABLE public.benefit_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id integer NOT NULL,
  account_id uuid NOT NULL,
  rule_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT benefit_cycle_scope UNIQUE (id, account_id, store_id),
  FOREIGN KEY (account_id, store_id) REFERENCES public.benefit_accounts(id, store_id),
  FOREIGN KEY (store_id, rule_version) REFERENCES public.store_benefit_program_versions(store_id, version)
);

CREATE TABLE public.benefit_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id integer NOT NULL,
  account_id uuid NOT NULL,
  order_id integer NOT NULL,
  rule_version integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('cashback','loyalty','reward')),
  cycle_id uuid,
  amount numeric(19,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  validity_days integer NOT NULL CHECK (validity_days > 0),
  reward_item_id integer,
  reward_item_name text,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','confirmed','reversed')),
  confirmed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT benefit_grant_scope UNIQUE (id, account_id, store_id),
  FOREIGN KEY (order_id, account_id, store_id) REFERENCES public.benefit_captures(order_id, account_id, store_id),
  FOREIGN KEY (cycle_id, account_id, store_id) REFERENCES public.benefit_cycles(id, account_id, store_id),
  FOREIGN KEY (store_id, rule_version) REFERENCES public.store_benefit_program_versions(store_id, version),
  CONSTRAINT benefit_grant_shape CHECK (
    (kind = 'cashback' AND cycle_id IS NULL AND reward_item_id IS NULL) OR
    (kind = 'loyalty' AND cycle_id IS NOT NULL AND amount = 0 AND reward_item_id IS NULL) OR
    (kind = 'reward' AND cycle_id IS NOT NULL)),
  CONSTRAINT benefit_grant_confirmation CHECK (
    (confirmed_at IS NULL AND expires_at IS NULL AND state <> 'confirmed') OR
    (confirmed_at IS NOT NULL AND expires_at IS NOT NULL AND expires_at > confirmed_at)),
  CONSTRAINT benefit_grant_product CHECK (reward_item_id IS NULL OR (kind = 'reward' AND amount = 0 AND reward_item_name IS NOT NULL))
);
CREATE UNIQUE INDEX benefit_grant_order_kind ON public.benefit_grants(order_id,kind) WHERE kind <> 'reward';
CREATE UNIQUE INDEX benefit_grant_cycle_reward ON public.benefit_grants(cycle_id) WHERE kind = 'reward';
CREATE INDEX benefit_grant_account_state ON public.benefit_grants(account_id,state);
CREATE INDEX benefit_grant_cycle ON public.benefit_grants(cycle_id,kind,state);

CREATE TABLE public.benefit_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id integer NOT NULL,
  account_id uuid NOT NULL,
  grant_id uuid,
  source_key text NOT NULL,
  original_amount numeric(19,2) NOT NULL DEFAULT 0,
  remaining_amount numeric(19,2) NOT NULL DEFAULT 0,
  spent_amount numeric(19,2) NOT NULL DEFAULT 0,
  expired_amount numeric(19,2) NOT NULL DEFAULT 0,
  offset_amount numeric(19,2) NOT NULL DEFAULT 0,
  revoked_amount numeric(19,2) NOT NULL DEFAULT 0,
  refunded_amount numeric(19,2) NOT NULL DEFAULT 0,
  frozen boolean NOT NULL DEFAULT false,
  reversed boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT benefit_lot_source UNIQUE (account_id,source_key),
  CONSTRAINT benefit_lot_scope UNIQUE (id,account_id,store_id),
  FOREIGN KEY (account_id,store_id) REFERENCES public.benefit_accounts(id,store_id),
  FOREIGN KEY (grant_id,account_id,store_id) REFERENCES public.benefit_grants(id,account_id,store_id),
  CONSTRAINT benefit_lot_conservation CHECK (
    original_amount > 0 AND remaining_amount >= 0 AND spent_amount >= 0 AND expired_amount >= 0 AND
    offset_amount >= 0 AND revoked_amount >= 0 AND refunded_amount >= 0 AND
    original_amount = remaining_amount + spent_amount + expired_amount + offset_amount + revoked_amount + refunded_amount),
  CONSTRAINT benefit_lot_reversed CHECK (NOT reversed OR remaining_amount = 0)
);
CREATE INDEX benefit_lot_account_expiry ON public.benefit_lots(account_id,expires_at,created_at,id);
CREATE INDEX benefit_lot_grant ON public.benefit_lots(grant_id);

CREATE TABLE public.benefit_debits (
  order_id integer PRIMARY KEY,
  store_id integer NOT NULL,
  account_id uuid NOT NULL,
  amount numeric(19,2) NOT NULL DEFAULT 0 CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT benefit_debit_scope UNIQUE (order_id,account_id,store_id),
  FOREIGN KEY (account_id,store_id) REFERENCES public.benefit_accounts(id,store_id),
  FOREIGN KEY (order_id,store_id) REFERENCES public.orders(id,store_id)
);

CREATE TABLE public.benefit_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id integer NOT NULL,
  account_id uuid NOT NULL,
  order_id integer NOT NULL,
  lot_id uuid NOT NULL,
  amount numeric(19,2) NOT NULL DEFAULT 0 CHECK (amount > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT benefit_allocation_order_lot UNIQUE (order_id,lot_id),
  FOREIGN KEY (account_id,store_id) REFERENCES public.benefit_accounts(id,store_id),
  FOREIGN KEY (order_id,account_id,store_id) REFERENCES public.benefit_debits(order_id,account_id,store_id),
  FOREIGN KEY (lot_id,account_id,store_id) REFERENCES public.benefit_lots(id,account_id,store_id)
);

CREATE TABLE public.benefit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id integer NOT NULL,
  account_id uuid NOT NULL,
  order_id integer,
  grant_id uuid,
  lot_id uuid,
  event_key text NOT NULL,
  type text NOT NULL,
  amount numeric(19,2) NOT NULL DEFAULT 0,
  debt_delta numeric(19,2) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT benefit_event_idempotency UNIQUE (account_id,event_key),
  FOREIGN KEY (account_id,store_id) REFERENCES public.benefit_accounts(id,store_id),
  FOREIGN KEY (order_id,store_id) REFERENCES public.orders(id,store_id),
  FOREIGN KEY (grant_id,account_id,store_id) REFERENCES public.benefit_grants(id,account_id,store_id),
  FOREIGN KEY (lot_id,account_id,store_id) REFERENCES public.benefit_lots(id,account_id,store_id)
);
CREATE INDEX benefit_event_order ON public.benefit_events(order_id,store_id);

-- numeric permits NaN despite positive comparisons. Origins and audit must be finite.
ALTER TABLE public.benefit_accounts ADD CONSTRAINT benefit_account_finite CHECK (adjustment_debt::text <> 'NaN');
ALTER TABLE public.benefit_captures ADD CONSTRAINT benefit_capture_finite CHECK (base_amount::text <> 'NaN' AND cashback_spent::text <> 'NaN');
ALTER TABLE public.benefit_grants ADD CONSTRAINT benefit_grant_finite CHECK (amount::text <> 'NaN');
ALTER TABLE public.benefit_lots ADD CONSTRAINT benefit_lot_finite CHECK (original_amount::text <> 'NaN');
ALTER TABLE public.benefit_debits ADD CONSTRAINT benefit_debit_finite CHECK (amount::text <> 'NaN');
ALTER TABLE public.benefit_allocations ADD CONSTRAINT benefit_allocation_finite CHECK (amount::text <> 'NaN');
ALTER TABLE public.benefit_events ADD CONSTRAINT benefit_event_finite CHECK (amount::text <> 'NaN' AND debt_delta::text <> 'NaN');

-- Immutability is enforced for the postgres backend too. State projections may
-- change under account locks, but identities, money origins and audit never do.
CREATE FUNCTION public.guard_benefit_history() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE old_record jsonb; new_record jsonb;
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN
    RAISE EXCEPTION 'Benefit history cannot be deleted' USING ERRCODE = '23514';
  END IF;
  old_record := to_jsonb(OLD);
  new_record := to_jsonb(NEW);
  IF TG_TABLE_NAME = 'benefit_accounts' THEN
    old_record := old_record - 'adjustment_debt'; new_record := new_record - 'adjustment_debt';
  ELSIF TG_TABLE_NAME = 'benefit_grants' THEN
    IF (OLD.state = 'reversed' AND NEW.state <> 'reversed') OR
       (OLD.kind <> 'reward' AND OLD.state = 'confirmed' AND NEW.state = 'pending') OR
       (OLD.confirmed_at IS NOT NULL AND (NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at OR NEW.expires_at IS DISTINCT FROM OLD.expires_at)) THEN
      RAISE EXCEPTION 'Invalid benefit grant transition' USING ERRCODE = '23514';
    END IF;
    old_record := old_record - ARRAY['state','confirmed_at','expires_at'];
    new_record := new_record - ARRAY['state','confirmed_at','expires_at'];
  ELSIF TG_TABLE_NAME = 'benefit_lots' THEN
    IF OLD.reversed AND NOT NEW.reversed THEN
      RAISE EXCEPTION 'Benefit lot reversal is terminal' USING ERRCODE = '23514';
    END IF;
    old_record := old_record - ARRAY['remaining_amount','spent_amount','expired_amount','offset_amount','revoked_amount','refunded_amount','frozen','reversed'];
    new_record := new_record - ARRAY['remaining_amount','spent_amount','expired_amount','offset_amount','revoked_amount','refunded_amount','frozen','reversed'];
  ELSE
    RAISE EXCEPTION 'Benefit history is append-only' USING ERRCODE = '23514';
  END IF;
  IF old_record IS DISTINCT FROM new_record THEN
    RAISE EXCEPTION 'Benefit origin is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_benefit_history() FROM PUBLIC, anon, authenticated, service_role;

-- Cycle rule, amount and historical product identity must agree even if a
-- backend accidentally supplies mismatched IDs. No live catalog FK exists.
CREATE FUNCTION public.guard_benefit_grant_origin() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE cycle_version integer; pinned public.store_benefit_program_versions;
BEGIN
  IF NEW.cycle_id IS NOT NULL THEN
    SELECT rule_version INTO cycle_version FROM public.benefit_cycles
      WHERE id = NEW.cycle_id AND store_id = NEW.store_id AND account_id = NEW.account_id;
    IF cycle_version IS DISTINCT FROM NEW.rule_version THEN
      RAISE EXCEPTION 'Benefit cycle rule mismatch' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT rule_version INTO cycle_version FROM public.benefit_captures
      WHERE order_id = NEW.order_id AND store_id = NEW.store_id AND account_id = NEW.account_id;
    IF cycle_version IS DISTINCT FROM NEW.rule_version THEN
      RAISE EXCEPTION 'Benefit capture rule mismatch' USING ERRCODE = '23514';
    END IF;
  END IF;
  SELECT * INTO pinned FROM public.store_benefit_program_versions
    WHERE store_id = NEW.store_id AND version = NEW.rule_version;
  IF NEW.kind = 'reward' AND (
    NOT pinned.loyalty_enabled OR
    NEW.validity_days IS DISTINCT FROM pinned.loyalty_reward_expires_after_days OR
    (pinned.loyalty_reward_type = 'cashback' AND
      (NEW.amount IS DISTINCT FROM pinned.loyalty_reward_amount::numeric OR NEW.reward_item_id IS NOT NULL)) OR
    (pinned.loyalty_reward_type = 'product' AND
      (NEW.amount <> 0 OR NEW.reward_item_id IS DISTINCT FROM pinned.loyalty_reward_item_id OR
       NEW.reward_item_name IS DISTINCT FROM pinned.loyalty_reward_item_name))) THEN
    RAISE EXCEPTION 'Benefit reward rule mismatch' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_benefit_grant_origin() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER benefit_grant_origin BEFORE INSERT ON public.benefit_grants
  FOR EACH ROW EXECUTE FUNCTION public.guard_benefit_grant_origin();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['benefit_accounts','benefit_captures','benefit_cycles','benefit_grants','benefit_lots','benefit_debits','benefit_allocations','benefit_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', table_name);
    EXECUTE format('CREATE TRIGGER benefit_history_guard BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_benefit_history()', table_name);
    EXECUTE format('CREATE TRIGGER benefit_no_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_benefit_history()', table_name);
  END LOOP;
END;
$$;

COMMENT ON TABLE public.benefit_accounts IS 'Private per-store phone identity, not proof of phone possession or debit authorization.';
COMMENT ON TABLE public.benefit_captures IS 'Trusted creation opt-in only. Immutable rule/identity/base. total_price is server net after promotions BEFORE wallet; debit must precede capture in the same creation tx; cashback_spent comes exclusively from benefit_debits.';
COMMENT ON TABLE public.benefit_cycles IS 'Oldest eligible vacancy first; pending reserves a slot. Rule pinned forever. Missing participation suspends remaining issued reward until repair, never charges consumed reward.';
COMMENT ON TABLE public.benefit_events IS 'Append-only audit without customer phone/name. Expiry materializes under account lock; summaries always exclude elapsed lots.';
COMMENT ON TABLE public.benefit_debits IS 'Internal primitive only. One immutable amount/account per order. Caller must separately prove ownership/authorization in KAN157.';
COMMIT;
