-- KAN-156: configuration only. No ledger/order/cycle/entitlement mutations.
-- KAN-152 MUST pin (store_id, version) at order creation, not completion.
-- Technical bounds: decimal dot strings <=2 places; BRL <=9999999999.99;
-- percentage (0,100]; counts/days/IDs int32 positive; no commercial defaults.
BEGIN;

-- Product ownership is checked at INSERT, not by a permanent catalog FK.
CREATE TABLE public.store_benefit_program_versions (
  store_id integer NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  version integer NOT NULL CONSTRAINT benefit_version_positive CHECK (version > 0),
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  cashback_enabled boolean NOT NULL,
  cashback_percentage text,
  cashback_expires_after_days integer,
  cashback_minimum_order_amount text,
  loyalty_enabled boolean NOT NULL,
  loyalty_required_orders integer,
  loyalty_minimum_order_amount text,
  loyalty_reward_type text,
  loyalty_reward_amount text,
  loyalty_reward_item_id integer,
  loyalty_reward_item_name text,
  loyalty_reward_expires_after_days integer,
  PRIMARY KEY (store_id, version),
  CONSTRAINT benefit_percentage CHECK (cashback_percentage IS NULL OR
    (cashback_percentage ~ '^(0|[1-9][0-9]{0,2})(\.[0-9]{1,2})?$'
      AND cashback_percentage::numeric > 0 AND cashback_percentage::numeric <= 100)),
  CONSTRAINT benefit_cashback_money CHECK (cashback_minimum_order_amount IS NULL OR
    cashback_minimum_order_amount ~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$'),
  CONSTRAINT benefit_loyalty_money CHECK (loyalty_minimum_order_amount IS NULL OR
    loyalty_minimum_order_amount ~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$'),
  CONSTRAINT benefit_reward_money CHECK (loyalty_reward_amount IS NULL OR
    (loyalty_reward_amount ~ '^(0|[1-9][0-9]{0,9})(\.[0-9]{1,2})?$' AND loyalty_reward_amount::numeric > 0)),
  CONSTRAINT benefit_positive_counts CHECK (
    (cashback_expires_after_days IS NULL OR cashback_expires_after_days > 0) AND
    (loyalty_required_orders IS NULL OR loyalty_required_orders > 0) AND
    (loyalty_reward_expires_after_days IS NULL OR loyalty_reward_expires_after_days > 0) AND
    (loyalty_reward_item_id IS NULL OR loyalty_reward_item_id > 0)),
  CONSTRAINT benefit_cashback_required CHECK (NOT cashback_enabled OR
    (cashback_percentage IS NOT NULL AND cashback_expires_after_days IS NOT NULL AND cashback_minimum_order_amount IS NOT NULL)),
  CONSTRAINT benefit_reward_shape CHECK (
    (loyalty_reward_type IS NULL AND loyalty_reward_amount IS NULL AND loyalty_reward_item_id IS NULL) OR
    (loyalty_reward_type IS NOT NULL AND loyalty_reward_type = 'cashback' AND loyalty_reward_item_id IS NULL) OR
    (loyalty_reward_type IS NOT NULL AND loyalty_reward_type = 'product' AND loyalty_reward_amount IS NULL)),
  CONSTRAINT benefit_loyalty_required CHECK (NOT loyalty_enabled OR
    (loyalty_required_orders IS NOT NULL AND loyalty_minimum_order_amount IS NOT NULL AND
      loyalty_reward_expires_after_days IS NOT NULL AND loyalty_reward_type IS NOT NULL AND
      ((loyalty_reward_type = 'cashback' AND loyalty_reward_amount IS NOT NULL) OR
       (loyalty_reward_type = 'product' AND loyalty_reward_item_id IS NOT NULL))))
);

ALTER TABLE public.store_benefit_program_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_benefit_program_versions FROM PUBLIC, anon, authenticated, service_role;
-- Backend uses postgres. No Data API policies or grants, including service_role.

CREATE FUNCTION public.guard_benefit_program_versions() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE latest integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Benefit program versions are immutable' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.stores WHERE id = NEW.store_id FOR UPDATE;
  SELECT coalesce(max(version), 0) INTO latest
    FROM public.store_benefit_program_versions WHERE store_id = NEW.store_id;
  IF NEW.version::bigint <> latest::bigint + 1 THEN
    RAISE EXCEPTION 'Benefit program version conflict' USING ERRCODE = '40001';
  END IF;
  IF NEW.loyalty_reward_item_id IS NOT NULL THEN
    SELECT item.name INTO NEW.loyalty_reward_item_name
      FROM public.items AS item
      WHERE item.id = NEW.loyalty_reward_item_id AND item.store_id = NEW.store_id
      FOR KEY SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Reward product must belong to the store' USING ERRCODE = '23514';
    END IF;
  ELSE
    NEW.loyalty_reward_item_name := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_benefit_program_versions() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER benefit_program_versions_insert_guard BEFORE INSERT ON public.store_benefit_program_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_benefit_program_versions();
CREATE TRIGGER benefit_program_versions_immutable BEFORE UPDATE OR DELETE ON public.store_benefit_program_versions
  FOR EACH ROW EXECUTE FUNCTION public.guard_benefit_program_versions();
CREATE TRIGGER benefit_program_versions_no_truncate BEFORE TRUNCATE ON public.store_benefit_program_versions
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_benefit_program_versions();

COMMENT ON TABLE public.store_benefit_program_versions IS
  'Immutable configuration. KAN-152 must pin store_id/version at order creation. No ledger in KAN-156.';
COMMENT ON COLUMN public.store_benefit_program_versions.loyalty_reward_item_id IS
  'Historical identity, not an authoritative live lookup. KAN-152/158 must not reinterpret snapshots through deleted/reused catalog IDs.';
COMMENT ON COLUMN public.store_benefit_program_versions.loyalty_reward_item_name IS
  'Catalog name snapshot set by INSERT trigger; retained after catalog edits/deletion.';
COMMIT;

-- Read-only post-deployment verification (execute separately):
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'public.store_benefit_program_versions'::regclass;
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name = 'store_benefit_program_versions';
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.store_benefit_program_versions'::regclass AND NOT tgisinternal;
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.store_benefit_program_versions'::regclass;
