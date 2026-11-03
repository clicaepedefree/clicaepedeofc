BEGIN;

-- Additive: existing grants remain the source of rights and original validity.
-- No FK to catalog items: deleting a product must preserve this history.
CREATE TABLE public.benefit_product_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id integer NOT NULL,
  account_id uuid NOT NULL,
  grant_id uuid NOT NULL,
  order_id integer NOT NULL,
  item_id integer NOT NULL,
  item_name text NOT NULL,
  original_expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'reserved',
  completed_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT benefit_product_redemption_order UNIQUE (order_id),
  FOREIGN KEY (grant_id, account_id, store_id)
    REFERENCES public.benefit_grants(id, account_id, store_id),
  FOREIGN KEY (order_id, store_id) REFERENCES public.orders(id, store_id),
  CONSTRAINT benefit_product_redemption_state CHECK (state IN ('reserved','completed','refunded')),
  CONSTRAINT benefit_product_redemption_times CHECK (
    original_expires_at > created_at
    AND (completed_at IS NULL OR completed_at >= created_at)
    AND (refunded_at IS NULL OR refunded_at >= coalesce(completed_at, created_at))
    AND ((state = 'reserved' AND completed_at IS NULL AND refunded_at IS NULL)
      OR (state = 'completed' AND completed_at IS NOT NULL AND refunded_at IS NULL)
      OR (state = 'refunded' AND refunded_at IS NOT NULL))
  )
);
CREATE UNIQUE INDEX benefit_product_redemption_active
  ON public.benefit_product_redemptions(grant_id) WHERE state <> 'refunded';
CREATE INDEX benefit_product_redemption_history
  ON public.benefit_product_redemptions(account_id, created_at, id);

ALTER TABLE public.benefit_product_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benefit_product_redemptions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.benefit_product_redemptions FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.guard_benefit_product_redemption() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Product reward history is immutable';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'reserved' OR NOT EXISTS (
      SELECT 1 FROM public.benefit_grants g
      WHERE g.id = NEW.grant_id AND g.account_id = NEW.account_id AND g.store_id = NEW.store_id
        AND g.kind = 'reward' AND g.state = 'confirmed' AND g.confirmed_at IS NOT NULL
        AND g.reward_item_id = NEW.item_id AND g.reward_item_name = NEW.item_name
        AND g.expires_at = NEW.original_expires_at AND g.expires_at > clock_timestamp()
    ) THEN
      RAISE EXCEPTION 'Invalid product reward reservation';
    END IF;
  ELSE
    IF (NEW.id, NEW.store_id, NEW.account_id, NEW.grant_id, NEW.order_id,
        NEW.item_id, NEW.item_name, NEW.original_expires_at, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.store_id, OLD.account_id, OLD.grant_id, OLD.order_id,
        OLD.item_id, OLD.item_name, OLD.original_expires_at, OLD.created_at)
      OR NOT ((OLD.state = 'reserved' AND NEW.state IN ('completed','refunded'))
        OR (OLD.state = 'completed' AND NEW.state = 'refunded'))
      OR (OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at)
      OR (OLD.state = 'reserved' AND NEW.state = 'refunded' AND NEW.completed_at IS NOT NULL)
    THEN
      RAISE EXCEPTION 'Product reward history is immutable';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_benefit_product_redemption() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER benefit_product_redemption_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.benefit_product_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.guard_benefit_product_redemption();
CREATE TRIGGER benefit_product_redemption_no_truncate
  BEFORE TRUNCATE ON public.benefit_product_redemptions
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_benefit_product_redemption();

COMMENT ON TABLE public.benefit_product_redemptions IS
  'Internal one-item reservation per order; grant UUID is the voucher. Original validity is never extended. Caller authorizes wallet identity, commits the zero-price item and stock atomically.';
COMMIT;
