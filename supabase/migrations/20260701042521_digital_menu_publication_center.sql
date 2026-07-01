-- KAN-18: independent editorial publication state for the public storefront.
ALTER TABLE public.store_digital_menu_settings
  ADD COLUMN IF NOT EXISTS publication_status text NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS published_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS publication_updated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS publication_updated_by_user_id text;

ALTER TABLE public.store_digital_menu_settings
  DROP CONSTRAINT IF EXISTS store_digital_menu_settings_publication_status_check;

ALTER TABLE public.store_digital_menu_settings
  ADD CONSTRAINT store_digital_menu_settings_publication_status_check
  CHECK (publication_status IN ('DRAFT', 'PUBLISHED', 'PAUSED'));

-- Preserve an explicitly configured legacy state while keeping untouched stores
-- in draft. The current production project has no rows in this table.
UPDATE public.store_digital_menu_settings
SET publication_status = CASE
  WHEN is_digital_menu_enabled = false THEN 'DRAFT'
  WHEN is_accepting_orders = false OR operational_status = 'PAUSED' THEN 'PAUSED'
  ELSE 'PUBLISHED'
END,
publication_updated_at = COALESCE(publication_updated_at, updated_at)
WHERE publication_updated_at IS NULL;

ALTER TABLE public.store_digital_menu_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.store_digital_menu_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.store_digital_menu_settings TO service_role;

-- Existing advisor finding: this privileged helper must never be callable by
-- browser roles through the Data API.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END
$$;

COMMENT ON COLUMN public.store_digital_menu_settings.publication_status IS
  'Editorial state of the public storefront; independent from opening hours and order operation.';
