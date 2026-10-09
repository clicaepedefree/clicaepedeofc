CREATE TABLE public.scheduled_job_leases (
  job text PRIMARY KEY CHECK (job IN ('billing', 'whatsapp')),
  owner uuid NOT NULL,
  expires_at timestamptz NOT NULL
);
ALTER TABLE public.scheduled_job_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_job_leases FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduled_job_leases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_job_leases TO service_role;
COMMENT ON TABLE public.scheduled_job_leases IS
  'Server-only leases. 15-minute reservation outlives 60-second Vercel jobs and database disconnects.';
