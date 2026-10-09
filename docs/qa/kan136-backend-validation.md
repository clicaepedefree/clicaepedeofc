# KAN-136: backend read-only validation

## Execution boundary

Only `scripts/qa/kan136-backend-audit.ts` performs this audit. It does not import
application DB/actions, load dotenv, read DPAPI files, decrypt tokens, or invoke a
worker. A private bootstrap must populate inherited process environment first.
Do not print that environment or enable SQL/HTTP debug logging.

Run from the repository root, inside the private bootstrap process:

```powershell
bun --no-env-file scripts/qa/kan136-backend-audit.ts
```

Output is fixed outside Git:
`D:/ProjetoIA/codex/clicaepede/KAN-136/backend-evidence.json`.
The file replaces the previous audit report; retain an approved sanitized copy
before rerunning if historical comparison is necessary. On Windows, POSIX mode
0600 does not establish an ACL: the external evidence directory must already have
restricted access. No credential or raw snapshot is written there by this script.

Required inherited variables: `POSTGRES_URL` (or `DATABASE_URL`),
`WHATSAPP_EVOLUTION_API_BASE_URL`, `WHATSAPP_EVOLUTION_API_KEY`.
`WHATSAPP_EVOLUTION_WEBHOOK_SECRET` is needed to verify the existing callback
authorization without publishing it. Rollout observations use
`WHATSAPP_BOT_ROLLOUT_MODE` and `WHATSAPP_BOT_PILOT_STORE_IDS`; these observations
describe bootstrap configuration, not verified deployed environment.

Optional non-secret selectors:

- `KAN136_EVENT_125_ID`: full event UUID. Otherwise the known `f829412f` prefix is
  resolved only when exactly one store9 event matches. Never reset this event.
- `KAN136_EVENT_134_ID`: full historical transactional event UUID; no guessed ID.
- `KAN136_MESSAGE_134_ID`: full historical inbound DB message UUID, not provider ID.
- `KAN136_EXPECTED_WEBHOOK_URL`: explicitly approved current target. Do not assume
  production: worker may target canonical production while webhook still targets
  the KAN134 preview. The audit reads and compares; it never retargets either.

## Precisely executed checks

Postgres uses `prepare:false`, one connection, statement/connect timeouts and a
`REPEATABLE READ READ ONLY` transaction. A transaction read-only guard is checked.
The only SET is transaction-local statement timeout. Schema columns are checked
against the live catalog before domain queries, using the inspected schema files
under `src/services/db/schema/whatsapp-bot-*.ts`. Missing columns block dependent
checks. Catalog index counts do not prove that specific index definitions are
correct. All application table queries are restricted to store9.

The snapshot observes sessions/numbers, config eligibility, aggregated contacts,
optout, handoff/conversation state, events and attempts; it counts existing
duplicate provider IDs, idempotency keys and event/attempt pairs. Aggregates are
not attributed to a new QA run. Exact historical selectors correlate persisted
events with successful attempt provider IDs, and inbound with `assistant:<uuid>`
reply records. No text, recipient, contact name, raw metadata or error message is
selected for publication.

Provider operations are limited to HTTPS, with no redirects or URL credentials:

- `GET /instance/connectionState/{existing-store9-instance}`.
- `GET /webhook/find/{existing-store9-instance}`.
- `POST /chat/findMessages/{existing-store9-instance}` with exact historical
  `where.key.id`, page 1, offset 10; at most 20 selected IDs. This POST reads
  provider history, it does not send or inject a message. Returned records must
  match the exact ID and expected `fromMe`; missing/unknown shapes are BLOCKED.

Historical records must also identify the current connected DB session. Missing
or different historical session IDs block the provider correlation; the script
never assumes that every store9 event used today's instance.

The webhook report contains only host, fixed callback path (other paths are
redacted), and flags. Query strings, fragments, credentials and header values
are never serialized. Required configuration is enabled, byEvents disabled,
base64 disabled, exactly CONNECTION_UPDATE/QRCODE_UPDATED/MESSAGES_UPSERT and
matching Bearer secret. Bypass presence is a flag, not proof that a preview is
reachable. Actual callback delivery is not exercised.

Provider IDs/instance identifiers use per-run HMAC references; salt is not
exported. These references link evidence inside one report, not across runs.
Full DB event UUIDs and numeric session/number IDs are non-content references;
treat the report as restricted operational evidence, not an unrestricted dump.

PASS means the named read/comparison succeeded, not overall WhatsApp acceptance.
FAIL means an observed expectation failed. BLOCKED means unavailable inputs,
unrecognized/unretained evidence, or an intentionally unexecuted operation.
Exit codes: 1 if any FAIL; otherwise 2 if any BLOCKED; otherwise 0.
New inbound/reply/handoff/optout/order-status and worker timer target are always
BLOCKED because this audit cannot execute or inspect them. There is no SSH.

## Physical and historical limits

No send/enqueue, webhook replay, session reset, QR, reconnect, logout, database
mutation, worker invocation, credential change or environment change occurs.
The existing pilot9 session and active cron are preserved. External systems may
change while provider reads run; the DB snapshot and HTTP reads are not atomic.

Historical KAN125/KAN134 `sent` plus provider storage proves only historical
acknowledgement/storage correlation. It does not prove recipient receipt, a
new inbound, current preview branch deployment, or a newly executed reply.
History may be absent because provider persistence/retention is disabled.
No new real tests have been sent according to the user's checkpoint.

## Observed user-run audit

The user executed the private-bootstrap audit on 2026-10-09. The existing external
report was reviewed without rewriting it: **8 PASS, 1 FAIL, 11 BLOCKED**.
DB session connected, provider open, configured webhook safeguards and historical
KAN125 database send acknowledgement passed. The observed callback still points
to a preview host; canonical production worker targeting is user-reported, not
verified by this script. No expected callback target was supplied for comparison.

The single FAIL is `db_assistant_reply_eligibility`: `draft` plus
`testModeEnabled=true` is the deliberately preserved no-LLM QA baseline. It means
the prerequisite for real assistant replies is not met, **not an app defect**.
Keep the literal check result; do not enable the assistant or change setup to make
the report green. New reply acceptance remains unavailable under this baseline.

KAN125 provider-history lookup returned zero matching records with a recognized
response envelope. `where.key.id` is a legitimate query in the version-pinned
[Evolution 2.3.7 implementation](https://github.com/EvolutionAPI/evolution-api/blob/2.3.7/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts#L4621).
This validates the upstream contract, not the running provider version. An empty
result cannot independently prove filter application, retention settings, receipt
or delivery failure. Keep BLOCKED. Invalid/unrecognized response schema is a
separate `unrecognized_history_shape` reason; an HTTP/parse error is a separate
`provider_read_failed`. Future reports expose only success/shape/count flags,
never provider payloads. KAN134 requires explicit historical selectors.

No new real inbound or reply was executed. Synthetic HTTP fixtures executed by
main must remain labeled synthetic and separate from historical transport proof.

## Future writable harness and cleanup (not implemented)

Approval must precede enqueue: the production cron can consume new events
immediately. Use unique QA markers and IDs, never reset existing statuses or
requeue event125. New inbound requires an independently authenticated authorized
sender; self-send/fromMe cannot replace it. Handoff needs an already eligible
automatic conversation; optout persists a preference; status notification needs
an approved QA order transition. None are performed here.

This sanitized audit is not a restorable backup. A future approved private backup
must encrypt config/session/contact snapshots and exclude PII/secrets from public
evidence. Never restore an entire baseline over later cron/webhook activity.
Compensations require exact QA IDs, column-level scope and current-value guards.
Preserve the real number, active config, session, pilot and cron while QA continues.
Redaction preserves references but prevents full replay; deletion loses history
and can affect dedup/FKs; undoing optout may contradict a real preference.
Do not disconnect merely to satisfy cleanup of temporary evidence.

## Local verification

Harness self-check, without DB/provider access or report output:

```powershell
bun --no-env-file scripts/qa/kan136-backend-audit.ts --self-test
```

Focused existing bot tests (no coverage, real transport not claimed):

```powershell
bun --no-env-file test --isolate ./src/features/whatsapp-bot ./src/app/api/webhooks/whatsapp/evolution/route.test.ts ./src/app/api/cron/whatsapp/transactional/route.test.ts ./src/features/order/status-notifications.test.ts
```

Verified locally on 2026-10-09, Bun 1.3.13:

- Self-test: PASS; no DB/provider requests or evidence report written.
- Focused command above: **168 pass, 0 fail, 1208 assertions, 22 files**.
  These are existing policy, mocked contract/route and journey tests, not real
  WhatsApp transport or coverage measurement.
- Isolated strict TypeScript check: PASS, no emit, using the command below.
- Live audit: executed by the user through the private bootstrap, not this agent;
  observed interpretation is documented above. No historical acceptance was
  promoted to newly executed inbound/reply.

```powershell
node node_modules/typescript/bin/tsc --noEmit --skipLibCheck --strict --target esnext --module esnext --moduleResolution bundler --esModuleInterop scripts/qa/kan136-backend-audit.ts
```

Local results are separate from the runtime backend report and never prepopulate
live PASS checks. Other agents' files were not modified.

## Read-only CJS review checkpoint

Reviewed `scripts/qa/kan136-webhook-contract.cjs` and
`scripts/qa/whatsapp-functional-regression.cjs` without running their entrypoints
or changing their source. `node --check` passed for both. These programs are
not read-only: contract fixtures insert/delete QA data, and browser modes can
save configuration or resume conversations. Synthetic contract entries correctly
declare `deployed-http-synthetic-fixture` and never prove WhatsApp transport.

Actionable findings in the reviewed revision:

- Contract cleanup (line 78) sets PASS even if `pairedSessionPreserved` is false;
  session preservation needs an assertion or non-PASS outcome.
- Browser mode dispatch (lines 115-215) accepts absent/unknown `QA_RUN_MODE`:
  zero results still exits successfully. Require a supported mode and actual cases.
- Paused ingestion (contract lines 44-48) checks only `deliveryStatus=not_sent`;
  the deliberately inactive config can block first. This cannot prove the human
  pause guard was responsible without checking `assistant.reason` and explicitly
  limiting the conclusion to whichever guard ran.
- Interactive cleanup (browser lines 143-167) verifies/restores only assistant
  name. Save writes the full config and audit state; this does not prove that the
  full baseline was preserved. Any stronger cleanup claim needs scoped comparison.

These are harness/evidence findings, not newly confirmed application defects.
The focused unit command was rerun after review: **168 pass, 0 fail, 1208
assertions, 22 files**, still without coverage or real WhatsApp transport.
