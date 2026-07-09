-- KAN-6 hardening: public order tracking is exposed only through server code.
-- These tables contain order snapshots, tracking hashes and audit/security data.
-- Do not expose them directly through Supabase Data API roles.

ALTER TABLE IF EXISTS public.public_order_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.public_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.public_order_delivery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.public_order_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.public_order_rate_limits ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.public_order_submissions FROM anon, authenticated;
REVOKE ALL ON TABLE public.public_order_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.public_order_delivery_attempts FROM anon, authenticated;
REVOKE ALL ON TABLE public.public_order_security_events FROM anon, authenticated;
REVOKE ALL ON TABLE public.public_order_rate_limits FROM anon, authenticated;

COMMENT ON TABLE public.public_order_submissions IS
  'Private digital-menu order intake records. Public tracking must go through server token validation, never direct Data API access.';
COMMENT ON TABLE public.public_order_events IS
  'Private append-only public-order timeline consumed by server-side tracking DTOs.';
