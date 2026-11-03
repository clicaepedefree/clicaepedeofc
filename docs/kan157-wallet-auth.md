# KAN-157 - Wallet phone OTP backend

## Scope And Approval

Customer-requested WhatsApp wallet OTP only. The bot remains PAUSED. This code
does not resume the assistant, change number/session state, enqueue replies,
create accounts, grant benefits or spend funds. No real messages were sent during
implementation/tests. Do not run the public request action against real provider
configuration during QA without new user approval.

Read CODEX.md, KAN-156 benefit rules, KAN-152 ledger contract and KAN-134 provider
runbook before rollout. Migration was created with `supabase migration new
kan157_wallet_auth`; applied through MCP and aligned locally to version
20261103020238. No real OTP delivery is claimed by unit/integration tests.

## Exact API Contracts

Client imports only `src/features/benefit-programs/wallet-auth-actions.ts`:

```ts
type Failure = { ok: false; message: string; retryAfterSeconds?: number }
requestWalletCode({ storeSlug, phone }): Promise<
  { ok: true; challengeId: string } | Failure
>
verifyWalletCode({ storeSlug, phone, challengeId, code }): Promise<
  { ok: true } | Failure
>
getWalletBalance({ storeSlug, phone }): Promise<
  { ok: true; availableAmount: string; pendingAmount: string } | Failure
>
clearWalletSession({ storeSlug }): Promise<{ ok: true } | Failure>
```

`requestWalletCode.ok` means neutral acceptance, NOT sent/delivered. Invalid
phone, unknown/inactive store, throttling, absent provider, offline connection
and unknown delivery receive the same shape with a random opaque challenge ID.
No benefit account lookup occurs on request. UI must say "Se disponivel, voce
recebera um codigo", never claim delivery or expose account existence. A global
precondition/DB failure may return Failure; messages never contain secrets or
provider errors. `retryAfterSeconds` is reserved, currently omitted to avoid
revealing throttle state. UI may use the fixed 60-second cooldown. Verify does
not return balance or cookie bearer; fetch balance after successful verification.

Internal server import `src/features/benefit-programs/wallet-auth.ts`:

```ts
requireWalletIdentity(storeId, phone, tx?): Promise<{ storeId: number; phone: string }>
```

Returned phone is canonical ledger identity (Brazil digits with 55 prefix), and
must match the supplied expected phone. The helper reads cookies freshly and
validates DB store/phone/browser/hash/expiry/revocation, never the supplied phone
alone. It throws `WALLET_AUTH_REQUIRED`. Checkout MUST call it inside its DB
transaction BEFORE any idempotent replay path AND before spending. Passing `tx`
holds the session row through checkout commit, serializing logout against spend.
Without tx it starts a short read transaction. It is NOT a public server action.
Actions enforce exact HTTPS Origin/Host and same-origin Fetch Metadata; the
checkout action retains Next's origin protection. Internal helper does not need
Origin and cannot be imported into a client component.

Balance comes from `getBenefitAccountSummary` only after verified identity, in
the same transaction. No commercial module gate is applied to existing funds.
Expired/pending/frozen/reversed funds remain excluded by the authoritative
ledger. This delivery does not change earning, expiry or spending policy.

## Configuration

- `WALLET_AUTH_HMAC_KEY`: independent server-only random key, >=32 bytes encoded
  as >=64 hexadecimal characters. Required; no fallback, test OTP or bypass.
  Generate/store privately in the deployment secret manager. Never commit it.
- `WALLET_AUTH_ENABLED=false`: explicit OTP kill switch. Default otherwise is
  enabled only for an explicit wallet request with required configuration.
- Existing `WHATSAPP_EVOLUTION_API_BASE_URL` (HTTPS),
  `WHATSAPP_EVOLUTION_API_KEY` and `IFOOD_TOKEN_ENCRYPTION_KEY` are reused.
- `DRIZZLE_DEBUG=true` disables public wallet actions to prevent query logging.
- Production HTTPS is mandatory for `__Host-` Secure cookies. Plain HTTP local
  browser testing is deliberately unsupported; there is no insecure-cookie mode.
- Vercel's overwritten `x-vercel-forwarded-for` is used only when `VERCEL=1`.
  Other ingress environments share the `unknown` IP bucket until a reviewed
  trusted-proxy adapter is added. Arbitrary X-Forwarded-For is never trusted.

Provider adapter joins number and session by store AND number ID, requires
Evolution and connected/paused configured session, expected generated instance
name, decryptable nonempty instance credential and live authenticated state
`open`. Inactive number and paused bot are intentionally allowed for this
approved explicit transaction. It does not require assistant enabled, rollout
for autonomous bot replies, contact opt-in or a benefit account. It never changes
bot configuration. State probe and send use existing 8-second fetch timeouts.

## State And Abuse Controls

- Challenge/session/browser tokens: cryptographic 256-bit random values. Only
  SHA-256 challenge/session/browser digests persist. Cookie bearers never JSON.
- Six-digit code uses crypto.randomInt; only HMAC-SHA256 persists, bound to
  challenge token, store, canonical phone and browser hash. Constant-time compare.
  Plaintext exists transiently only to compose the provider request; no DB,
  queue, event, error payload or application log stores it.
- Challenge TTL 5 minutes, max 5 code attempts. Verification locks the challenge
  row and commits failed-attempt increments; successful consumption/session
  creation are atomic. Invalid code format also counts for a matching challenge.
  Wrong store/phone/browser cannot use it. Expiry uses DB clock AFTER row lock.
  A new admitted request advisory-locks its store/phone/browser scope and locks
  previous pending/sent/unknown challenges before inserting its replacement.
  Old codes cannot verify after resend, and a late old ACK cannot revive them.
- Challenge persists before provider probe/send, outside DB transactions.
  `pending -> sent` is CAS and only after nonempty provider message ACK, while
  unexpired. No verification in pending/unknown. Exception, timeout or incomplete
  ACK becomes unknown (or remains pending if DB reconciliation fails), unusable.
  No automatic resend/retry; the customer can explicitly request a NEW challenge
  subject to cooldown/budgets. ACK is not proof of physical delivery.
- Session TTL 15 minutes, not sliding. HttpOnly/Secure/SameSite=Strict/Path=/,
  no Domain; per-store `__Host-wallet-<storeId>` and shared browser binding.
  Successful reauthentication revokes prior same-store/phone/browser sessions.
- Logout locks challenges before revoking ALL same-browser/store sessions to
  cover a concurrent token rotation, then expires the session cookie. Pending
  challenges are locked, so a pre-logout code cannot authenticate afterward.
  Browser binding remains to avoid invalidating other stores' cookies.
- Request budgets, shared across server instances: global 2000/hour, IP
  20/hour, store slug 200/rolling-24h, store/IP 10/hour, canonical phone globally
  5/hour with 60-second resend cooldown. Verify: global 10000/hour, IP 100/hour,
  plus per-challenge five attempts. All requests, including invalid store/phone,
  consume global budgets BEFORE store lookup. Phone/IP keys are HMAC, not raw.
- Rate buckets are transactionally advisory-locked in deterministic order even
  before first row exists, then upserted. Rejected calls commit budget usage,
  never throw/rollback increments. Once a bucket rejects, later secondary keys
  are not allocated (global keys sort first), bounding per-hour key growth.
  Conservative rejected requests extend phone
  cooldown. Rolling windows are not calendar-midnight resets.
- Private tables have enabled + forced RLS, no policies and revoked privileges
  for PUBLIC/anon/authenticated/service_role. App uses its existing privileged
  direct PostgreSQL connection, not the Data API. Main owns schema/index export.

## Threat Model And Residual Risks

Protected: phone-only impersonation; cross-store/phone/browser replay; challenge
guessing; online code brute force and replay; offline code brute force from DB
alone; CSRF; body token theft; spending through stale/revoked cookies; parallel
attempts and cross-instance rate races; unrestricted SMS/WhatsApp pumping; bot
activation by OTP; provider timeout retries; balance/account enumeration.

Not protected: compromised WhatsApp/SIM/browser/device; same-origin XSS acting
as user; compromised server/HMAC key; infrastructure logs capturing outbound
provider request bodies; malicious trusted proxy configuration; a distributed
attacker exhausting global budgets (fail-closed availability tradeoff).
Infrastructure MUST redact request bodies and secrets. Rotate HMAC key by an
explicit deployment (outstanding codes stop working; existing DB-backed sessions
remain valid until logout/short expiry). Cookie signing is unnecessary: random
bearers require an existing matching private DB row and browser binding.

No background cleanup/job is installed. Every request performs bounded indexed
retention after rate locks: at most 100 challenges and 100 sessions expired more
than one day ago, and 100 rate rows inactive for more than two days. Cleanup uses
FOR UPDATE SKIP LOCKED, never live budgets/tokens. Global admission also bounds
new rate-key creation after exhaustion. Idle expired records persist until the
next request; a separately reviewed scheduled purge can accelerate idle cleanup.
Never delete live rate buckets or reset daily caps. Monitor only aggregate counts,
never phone/code/cookie/provider payload. Global limits bound sends, not arbitrary
unauthenticated read traffic; use platform WAF/IP limits as defense in depth.

## Verification

Focused tests cover crypto bindings, input/origin/cookies, attempts/expiry/state,
DB query scopes/locks, rate buckets, logout, identity-first balance, neutral API
shapes, commit-before-provider, paused/inactive direct transport and unknown ACK.
All DB/transport fixtures are in-memory mocks; they are NOT PostgreSQL concurrency,
RLS enforcement, browser-cookie acceptance or real physical-delivery proof.

Run `bun test --isolate src/features/benefit-programs/wallet-auth*.test.ts` with
shell-expanded paths, or explicit paths on PowerShell. Repository tsc currently
includes legacy incomplete bun:test ambient declarations; report production-only
typecheck separately from whole-repository diagnostics.

Pending before rollout (requires separately approved environment/actions): apply
reviewed migration; PostgreSQL integration with simultaneous five/six attempts,
first-use rate locks, logout/verify/spend races, Data API grants and rollback;
HTTPS browser cross-store/session expiry/logout; configured provider disabled,
offline and timeout paths. Real WhatsApp delivery requires NEW explicit approval
and recipient confirmation, never inferred from fixtures/ACK. Keep bot PAUSED.
