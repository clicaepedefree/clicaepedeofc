# KAN-152/157 PostgreSQL concurrency QA

Status: authored for review; NOT executed. Main must explicitly confirm that the
native suite has finished before any database execution. Do not overlap this
harness with native, database, browser, or other mutable QA suites.

## Scope and isolation

External harness: `D:/ProjetoIA/codex/clicaepede/KAN-152/concurrency.ts`.
Reads the current ledger and wallet-auth DB primitives, existing `database.ts`,
`run.ps1`, `docs/kan152-benefit-ledger.md`, the archive section of
`docs/internal-operations-runbook.md`, and `docs/qa/kan136-runbook.md` contracts.
No product source, migration, deployment, worker, rollout, or store 9 changes.
No physical sends, OTP/provider calls, outbox enqueue, or HTTP requests.
Global fetch is denied and counted. PostgreSQL transport is the only intended I/O
beyond local evidence files. This guard is not a general OS network sandbox.

Two independent postgres-js clients have one connection each and distinct backend
PIDs. A single committed setup transaction creates a unique UUID-named **inactive**
store, one synthetic account and audited credit lot of 10.00, two pending orders
without benefit capture, and two synthetic auth sessions. No user, entitlement,
billing config, or production account is reused. Synthetic identity/session data
is retained privately in the DB, never serialized into the report.

Committed fixtures are necessary: savepoints or a rollback-only outer transaction
cannot expose new balances to an independent connection. The initial advisory-lock
smoke does roll back its holder; later money tests must commit the winning debit.
This is DB primitive QA, not public checkout, earning-rule, cookie, OTP, complete
logout-action, or delivery evidence. The synthetic credit bypasses capture and is
explicitly marked synthetic in its append-only event.

## Assertions

- Manual account advisory lock blocks a real summary on connection 2; after holder
  rollback, connection 2 sees exactly the committed 10.00.
- Connection 1 debits the full 10.00 while holding the real account lock; another
  order on connection 2 must wait, then fail with insufficient funds after commit.
  Exactly one debit/event and allocations totalling 10.00 remain; available funds
  and debt are zero and every lot conserves money. Winner ordering is deliberate,
  not a randomized stress/fairness test.
- Two overlapping same-order primitive replays succeed without another debit,
  allocation, event, or balance change. This is order-level idempotency, not HTTP
  request-key validation.
- Authorized checkout holds the session row through an idempotent debit replay;
  revocation waits, then subsequent authorization fails.
- Conversely, a revocation held before authorization makes checkout wait and then
  fail with `WALLET_AUTH_REQUIRED` before its debit. Financial state is unchanged.

The holder polls `pg_blocking_pids` on its own connection and requires the waiting
backend to be blocked by that holder. A sleep alone is never evidence of locking.
Missing observation fails the test (including a proxy without usable stable
backend PIDs). Both competing promises settle before cleanup. Transactions use
READ COMMITTED with bounded lock, statement, and idle-in-transaction timeouts.

## Execution By Main Only

Only after main confirms the native suite has exited, in a private PowerShell:

```powershell
$env:KAN152_NATIVE_SUITE_FINISHED='true'
try {
  & 'D:/ProjetoIA/codex/clicaepede/KAN-152/run.ps1' -Mode concurrency
} finally {
  Remove-Item Env:KAN152_NATIVE_SUITE_FINISHED -ErrorAction SilentlyContinue
}
```

The existing runner decrypts DPAPI environment values privately. Do not print
environment variables, connection URLs, decrypted credentials, raw DB exceptions,
or full phone numbers. Do not run the TS directly without that private environment.
The harness refuses execution before connecting unless the explicit gate is true.
This is an operator attestation, not automatic cross-process suite detection.
Do not set it speculatively. No migrations are applied; missing tables/permissions
are a failed prerequisite for main to resolve, not permission to migrate.

## Cleanup and Recovery

The `finally` cleanup re-finds only the unguessable run subdomain, rejects store 9
and any order without this run's origin marker, and cancels only fixture orders.
It appends status-change audit events, invokes ledger settlement/refund (including
an idempotent second refund), revokes sessions, freezes the synthetic/restored lots,
and archives the store with an internal audit record. Freeze preserves original
money and expiry while making this fixture's balance unavailable. No immutable
row is deleted, rewritten, or truncated; no trigger is disabled. Debits, allocations,
credits, refunds, order audit, and archive audit remain. Archived fixtures still
affect raw counts; do not claim rollback-only QA or complete data removal.

Cleanup commits atomically, then a fresh transaction verifies archived status,
cancelled orders, revoked sessions, frozen lots, zero spendable balance, and a
matching refund event for every allocation, no remaining spent money, lot
conservation, and exactly one harness archive audit. Any cleanup failure sets nonzero exit status
and `FAIL_REQUIRES_RECOVERY`; a test failure is never disguised as cleanup success.
The report records the run UUID before setup so interrupted/uncertain commits can
be located by subdomain. Hard termination cannot guarantee `finally` execution.

For interrupted-run recovery, first ensure ALL earlier processes/connections have
stopped. Main must load the same DPAPI environment through the private runner
procedure (without printing it); `run.ps1` does not forward extra CLI arguments.
Then from the repository working directory, with that environment still loaded:

```powershell
$env:KAN152_NATIVE_SUITE_FINISHED='true'
$env:KAN152_CONCURRENCY_RUN_ID='<UUID from sanitized report>'
try {
  & 'D:/ProjetoIA/tools/bun/bin/bun.exe' 'D:/ProjetoIA/codex/clicaepede/KAN-152/concurrency.ts' --cleanup-only
} finally {
  Remove-Item Env:KAN152_NATIVE_SUITE_FINISHED -ErrorAction SilentlyContinue
  Remove-Item Env:KAN152_CONCURRENCY_RUN_ID -ErrorAction SilentlyContinue
}
```

Recovery only searches/cancels/refunds/freezes/archives that run; it does not seed
new fixtures or repeat money tests. Repeated recovery is idempotent. Absence of the
UUID's store is a successful no-op if nothing was committed. Do not delete a store
to satisfy cleanup, especially one referenced by append-only records.

## Evidence

Per-run sanitized JSON: `KAN-152/concurrency-<UUID>.json`; recovery writes a separate
`concurrency-<UUID>-cleanup.json`. Includes only phase, PASS/FAIL labels, observed
wait flags, fixture store ID, run UUID, cleanup state, and fetch count. No raw SQL
errors, phone, auth secrets, request payloads, or environment values are emitted.
Main should review both exit status and cleanup status before publishing evidence.
All five assertions plus the no-fetch check and cleanup must pass. This document
is not an executed PASS report; attach actual sanitized evidence after main runs.

## Browser Session Fixture Contract For Main

Prepared from `src/services/db/schema/wallet-auth.ts`, `wallet-auth-policy.ts`,
`wallet-auth-db.ts`, and `wallet-auth-actions.ts`; no browser fixture has been
created or executed here. The concurrency harness's arbitrary synthetic session
keys exercise DB primitives only: do NOT reuse those as browser tokens.

| Item | Required browser fixture contract |
| --- | --- |
| Ownership | Separate unique QA store/account, never store 9 or a real customer's identity. Browser actions require the store to be `active`; this harness's inactive/archived fixture is deliberately unsuitable. Main must provision any browser fixture separately after serial-suite clearance. |
| Raw tokens | Generate independent session token and browser binding with `newWalletToken()`: each is 32 random bytes encoded as exactly 64 lowercase hexadecimal characters. Keep raw values only in memory/private browser context. |
| Committed DB row | `wallet_auth_sessions`: `token_hash=walletHash(rawToken)`, own `store_id`, canonical normalized `phone`, `binding_hash=walletHash(rawBinding)`, `expires_at` from DB clock plus `walletPolicy.sessionSeconds` (currently 900 seconds), `revoked_at=NULL`; `created_at` defaults. `token_hash` is the primary key. Commit before browser access. |
| Cookies | Names `__Host-wallet-<storeId>` (raw session token) and `__Host-wallet-browser` (raw binding). Both HTTP-only, Secure, SameSite Strict, path `/`, host-only with NO Domain attribute. Seed on the exact authorized HTTPS origin, not a sibling host. Session max-age 900 seconds; normal binding max-age is session plus challenge lifetime (currently 1200 seconds). |
| Identity check | Must match store, canonical phone, both hashes, unrevoked state and unexpired DB time. `readWalletIdentity` locks the row through checkout commit. Wrong store/phone/binding, missing/invalid cookies, expiry, and revocation must fail. |
| Action preconditions | Wallet server actions additionally require exact same-origin HTTPS Origin/Host and same-origin fetch-site when present, a valid private `WALLET_AUTH_HMAC_KEY`, and `DRIZZLE_DEBUG` not equal to `true`. A seeded session alone does not bypass these checks. Never print or change that key for the fixture. |
| No-send boundary | Do not invoke `requestWalletCode` or the provider sender. Use session injection only with explicitly synthetic QA ownership. No challenge row, phone delivery, bot configuration, or worker change is needed. |
| Cleanup | Cancel/refund own orders, revoke exactly owned sessions/bindings, close the isolated browser context, archive its dedicated store with audit, and preserve ledger/audit rows. Do not clear global auth-rate buckets or revoke other sessions. Keep raw cookies/tokens out of screenshots, traces, storage state, and public reports. |

Claims must say **seeded-session browser QA**, not OTP verification or proof of
phone ownership. Test logout/revocation with a fresh session for each scenario;
after revocation never reactivate the same row. Browser/deployment execution
remains main's responsibility after all previous mutable suites stop.

## Native Failed-Attempt Handoff

Main reported a native expiry-fixture timing issue while the suite was still
running: `status(REJECTED)` already refunds via settlement, so taking
`beforeClock` afterward cannot bound that existing refund's timestamp during an
idempotent second refund. Main owns moving the clock sample before the status
transition after the suite exits. No engine change is implied, and this harness
does not edit that test. Preserve the original failing attempt and record the
fixture correction and rerun as separate evidence; do not overwrite failure logs
or call the unexecuted concurrency harness a PASS.
