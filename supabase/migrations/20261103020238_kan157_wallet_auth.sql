BEGIN;

CREATE TABLE public.wallet_auth_challenges (
  id_hash text PRIMARY KEY CHECK (id_hash ~ '^[a-f0-9]{64}$'),
  store_id integer NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  phone text NOT NULL CHECK (phone ~ '^55[0-9]{10,11}$'),
  binding_hash text NOT NULL CHECK (binding_hash ~ '^[a-f0-9]{64}$'),
  code_hash text NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','unknown','consumed','locked')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '5 minutes 1 second')
);
CREATE INDEX wallet_auth_challenge_expiry_idx ON public.wallet_auth_challenges(expires_at);
CREATE INDEX wallet_auth_challenge_scope_idx ON public.wallet_auth_challenges(store_id, phone, binding_hash);

CREATE TABLE public.wallet_auth_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  store_id integer NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  phone text NOT NULL CHECK (phone ~ '^55[0-9]{10,11}$'),
  binding_hash text NOT NULL CHECK (binding_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes 1 second')
);
CREATE INDEX wallet_auth_session_expiry_idx ON public.wallet_auth_sessions(expires_at);

CREATE TABLE public.wallet_auth_rates (
  key text PRIMARY KEY,
  count integer NOT NULL CHECK (count >= 0),
  window_start timestamptz NOT NULL,
  last_at timestamptz NOT NULL
);
CREATE INDEX wallet_auth_rate_retention_idx ON public.wallet_auth_rates(last_at);

DO $$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['wallet_auth_challenges','wallet_auth_sessions','wallet_auth_rates'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', name);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated, service_role', name);
  END LOOP;
END;
$$;
COMMENT ON TABLE public.wallet_auth_challenges IS 'Private requested OTP only. HMAC code, hashed random challenge and browser binding. Never queue plaintext OTP.';
COMMENT ON TABLE public.wallet_auth_sessions IS 'Private short-lived wallet phone authority. Cookie bearer is never persisted or returned in JSON.';
COMMENT ON TABLE public.wallet_auth_rates IS 'Private transactional cross-instance budgets. HMAC phone/IP keys; no raw IP.';
COMMIT;
